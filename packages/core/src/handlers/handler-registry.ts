import { logger } from "../logger.js";

import type { TransportManager } from "../transport/transport.js";
import type {
  EventInfo,
  EventMetrics,
  HandlerCtx,
  HandlerFunction,
  PublishFunction,
  RetryConfig,
} from "../types.js";

type HandlerEntry = {
  handler: HandlerFunction;
  retry?: RetryConfig;
};

const PROCESSING_LOCK_TTL_SECONDS = 300;
const DEDUPE_TTL_SECONDS = 86400;

export class HandlerRegistry {
  private handlers = new Map<string, Set<HandlerEntry>>();
  private processingLocks = new Set<string>();
  private subscribedChannels = new Set<string>();

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
      .flatMap(([type, entries]) =>
        Array.from(entries).map((entry) => ({
          type,
          ...(entry.retry && { retry: entry.retry }),
        })),
      );
  }

  register(
    eventType: string,
    handlerFn: HandlerFunction,
    retry?: RetryConfig,
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add({
      handler: handlerFn,
      ...(retry && { retry }),
    });

    if (!this.subscribedChannels.has(eventType)) {
      this.subscribedChannels.add(eventType);
      this.redis.subscribeToChannel(eventType, (message: string) => {
        void this.handleMessage(eventType, message);
      });
    }
  }

  private async handleMessage(
    eventType: string,
    message: string,
  ): Promise<void> {
    const entries = this.handlers.get(eventType);
    if (!entries || entries.size === 0) {
      return;
    }

    let event: { requestId: string; payload: unknown };
    try {
      event = JSON.parse(message) as { requestId: string; payload: unknown };
    } catch {
      logger.error(
        `[HandlerRegistry] - Malformed message on "${eventType}", dropping: ${message}`,
      );
      return;
    }

    if (!event.requestId || typeof event.requestId !== "string") {
      logger.error(
        `[HandlerRegistry] - Missing or invalid requestId on "${eventType}", dropping message`,
      );
      return;
    }

    const localLockKey = `${event.requestId}:${eventType}`;
    if (this.processingLocks.has(localLockKey)) {
      return;
    }

    const dedupeKey = this.dedupeKey(localLockKey);
    const alreadyProcessed = await this.redis.getCache(dedupeKey);
    if (alreadyProcessed === "1") {
      logger.debug(
        `[HandlerRegistry] duplicate message ignored for "${eventType}" (requestId: ${event.requestId})`,
      );
      return;
    }

    this.processingLocks.add(localLockKey);

    const distributedLockKey = this.distributedLockKey(localLockKey);
    let distributedLockAcquired = false;

    const trackMetrics = !eventType.startsWith("workflow:");

    try {
      distributedLockAcquired = await this.redis.setCacheIfNotExists(
        distributedLockKey,
        "1",
        PROCESSING_LOCK_TTL_SECONDS,
      );

      if (!distributedLockAcquired) {
        logger.debug(
          `[HandlerRegistry] in-flight message ignored for "${eventType}" (requestId: ${event.requestId})`,
        );
        return;
      }

      logger.debug(
        `[HandlerRegistry] handleMessage("${eventType}") entries=${entries.size}`,
      );

      if (trackMetrics) {
        await this.redis.incrementCache(`synkro:metrics:${eventType}:received`);
      }

      const results = await Promise.allSettled(
        Array.from(entries).map((entry) =>
          this.executeHandler(eventType, entry, event),
        ),
      );

      const allSucceeded = results.every((r) => r.status === "fulfilled");

      if (trackMetrics) {
        if (allSucceeded) {
          await this.redis.incrementCache(`synkro:metrics:${eventType}:completed`);
        } else {
          await this.redis.incrementCache(`synkro:metrics:${eventType}:failed`);
        }
      }

      this.redis.publishMessage(
        `event:${eventType}:${allSucceeded ? "completed" : "failed"}`,
        JSON.stringify({
          requestId: event.requestId,
          payload: event.payload,
        }),
      );

      await this.redis.setCache(dedupeKey, "1", DEDUPE_TTL_SECONDS);
    } finally {
      this.processingLocks.delete(localLockKey);
      if (distributedLockAcquired) {
        await this.redis.deleteCache(distributedLockKey);
      }
    }
  }

  private distributedLockKey(lockKey: string): string {
    return `synkro:lock:handler:${lockKey}`;
  }

  private dedupeKey(lockKey: string): string {
    return `synkro:dedupe:handler:${lockKey}`;
  }

  private async executeHandler(
    eventType: string,
    entry: HandlerEntry,
    event: { requestId: string; payload: unknown },
  ): Promise<void> {
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
          throw error;
        }
      }
    }
  }
}
