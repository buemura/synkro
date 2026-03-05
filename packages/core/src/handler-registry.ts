import { logger } from "./logger.js";

import type { TransportManager } from "./transport.js";
import type {
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

  private publishFn: PublishFunction | null = null;

  constructor(private redis: TransportManager) {}

  setPublishFn(fn: PublishFunction): void {
    this.publishFn = fn;
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
    const maxRetries = entry.retry?.maxRetries ?? 0;

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
  }
}
