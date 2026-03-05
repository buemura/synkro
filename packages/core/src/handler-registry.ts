import { logger } from "./logger.js";

import type { TransportManager } from "./transport.js";
import type {
  EventInfo,
  EventMetrics,
  HandlerCtx,
  HandlerFunction,
  PublishFunction,
  RetryConfig,
} from "./types.js";

type HandlerEntry = {
  handler: HandlerFunction;
  retry?: RetryConfig;
};

export class HandlerRegistry {
  private handlers = new Map<string, HandlerEntry>();
  private processingLocks = new Set<string>();

  private publishFn: PublishFunction | null = null;

  constructor(private redis: TransportManager) {}

  setPublishFn(fn: PublishFunction): void {
    this.publishFn = fn;
  }

  async getEventMetrics(eventType: string): Promise<EventMetrics> {
    const [received, completed, failed] = await Promise.all([
      this.redis.getCache(`synkro:metrics:${eventType}:received`),
      this.redis.getCache(`synkro:metrics:${eventType}:completed`),
      this.redis.getCache(`synkro:metrics:${eventType}:failed`),
    ]);
    return {
      type: eventType,
      received: Number(received ?? 0),
      completed: Number(completed ?? 0),
      failed: Number(failed ?? 0),
    };
  }

  getRegisteredEvents(): EventInfo[] {
    return Array.from(this.handlers.entries())
      .filter(([type]) => !type.startsWith("workflow:"))
      .map(([type, entry]) => ({
        type,
        ...(entry.retry && { retry: entry.retry }),
      }));
  }

  register(
    eventType: string,
    handlerFn: HandlerFunction,
    retry?: RetryConfig,
  ): void {
    this.handlers.set(eventType, {
      handler: handlerFn,
      ...(retry && { retry }),
    });

    this.redis.subscribeToChannel(eventType, (message: string) => {
      this.handleMessage(eventType, message);
    });
  }

  private async handleMessage(
    eventType: string,
    message: string,
  ): Promise<void> {
    const entry = this.handlers.get(eventType);
    if (!entry) {
      return;
    }

    const event = JSON.parse(message) as { requestId: string; payload: unknown };

    const lockKey = `${event.requestId}:${eventType}`;
    if (this.processingLocks.has(lockKey)) {
      return;
    }
    this.processingLocks.add(lockKey);

    const maxRetries = entry.retry?.maxRetries ?? 0;
    const trackMetrics = !eventType.startsWith("workflow:");

    try {
      if (trackMetrics) {
        await this.redis.incrementCache(`synkro:metrics:${eventType}:received`);
      }

      const ctx: HandlerCtx = {
        requestId: event.requestId,
        payload: event.payload,
        publish: this.publishFn!,
        setPayload(data: Record<string, unknown>) {
          ctx.payload =
            typeof ctx.payload === "object" && ctx.payload !== null
              ? { ...ctx.payload, ...data }
              : data;
        },
      };

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await entry.handler(ctx);

          if (trackMetrics) {
            await this.redis.incrementCache(`synkro:metrics:${eventType}:completed`);
          }
          this.redis.publishMessage(
            `event:${eventType}:completed`,
            JSON.stringify({
              requestId: ctx.requestId,
              payload: ctx.payload,
            }),
          );
          return;
        } catch (error) {
          if (attempt < maxRetries) {
            logger.warn(
              `[HandlerRegistry] - Handler "${eventType}" failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`,
            );
          } else {
            logger.error(
              `[HandlerRegistry] - Handler "${eventType}" failed after ${maxRetries + 1} attempt(s): ${error}`,
            );

            if (trackMetrics) {
              await this.redis.incrementCache(`synkro:metrics:${eventType}:failed`);
            }
            this.redis.publishMessage(
              `event:${eventType}:failed`,
              JSON.stringify({
                requestId: ctx.requestId,
                payload: ctx.payload,
              }),
            );
          }
        }
      }
    } finally {
      this.processingLocks.delete(lockKey);
    }
  }
}
