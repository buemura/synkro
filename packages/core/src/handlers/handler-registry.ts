import { Logger } from "../logger.js";

import type { TransportManager } from "../transport/transport.js";
import type {
  EventInfo,
  EventMetrics,
  HandlerCtx,
  HandlerFunction,
  PublishFunction,
  RetentionConfig,
  RetryBackoffStrategy,
  RetryConfig,
  SchemaValidator,
} from "../types.js";

type HandlerEntry = {
  handler: HandlerFunction;
  retry?: RetryConfig;
  schema?: SchemaValidator;
};

const DEFAULT_RETRY_DELAY_MS = 1000;

function computeRetryDelay(
  attempt: number,
  backoff: RetryBackoffStrategy = "fixed",
  baseDelayMs: number = DEFAULT_RETRY_DELAY_MS,
  jitter: boolean = false,
): number {
  const delay =
    backoff === "exponential"
      ? baseDelayMs * Math.pow(2, attempt)
      : baseDelayMs;

  if (!jitter) return delay;

  return Math.round(delay * (0.5 + Math.random()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeError(err: unknown): { message: string; name?: string } {
  if (err instanceof Error) {
    return { message: err.message, name: err.name };
  }
  return { message: String(err) };
}

const DEFAULT_LOCK_TTL = 300;
const DEFAULT_DEDUPE_TTL = 86400;

export class HandlerRegistry {
  private handlers = new Map<string, Set<HandlerEntry>>();
  private processingLocks = new Set<string>();
  private subscribedChannels = new Set<string>();
  private schemas = new Map<string, SchemaValidator>();

  private publishFn: PublishFunction | null = null;
  private readonly lockTtl: number;
  private readonly dedupTtl: number;
  private readonly metricsTtl: number | undefined;

  constructor(
    private redis: TransportManager,
    retention?: RetentionConfig,
    private readonly logger: Logger = new Logger(),
  ) {
    this.lockTtl = retention?.lockTtl ?? DEFAULT_LOCK_TTL;
    this.dedupTtl = retention?.dedupTtl ?? DEFAULT_DEDUPE_TTL;
    this.metricsTtl = retention?.metricsTtl;
  }

  get activeCount(): number {
    return this.processingLocks.size;
  }

  setPublishFn(fn: PublishFunction): void {
    this.publishFn = fn;
  }

  registerSchema(eventType: string, schema: SchemaValidator): void {
    this.schemas.set(eventType, schema);
  }

  getSchema(eventType: string): SchemaValidator | undefined {
    return this.schemas.get(eventType);
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
    schema?: SchemaValidator,
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add({
      handler: handlerFn,
      ...(retry && { retry }),
      ...(schema && { schema }),
    });

    if (!this.subscribedChannels.has(eventType)) {
      this.subscribedChannels.add(eventType);
      this.redis.subscribeToChannel(eventType, (message: string) => {
        void this.handleMessage(eventType, message);
      });
    }
  }

  unregister(eventType: string, handlerFn?: HandlerFunction): void {
    const entries = this.handlers.get(eventType);
    if (!entries) return;

    if (handlerFn) {
      for (const entry of entries) {
        if (entry.handler === handlerFn) {
          entries.delete(entry);
          break;
        }
      }
    } else {
      entries.clear();
    }

    if (entries.size === 0) {
      this.handlers.delete(eventType);
      if (this.subscribedChannels.has(eventType)) {
        this.subscribedChannels.delete(eventType);
        this.redis.unsubscribeFromChannel(eventType);
      }
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
      this.logger.error(
        `[HandlerRegistry] - Malformed message on "${eventType}", dropping: ${message}`,
      );
      return;
    }

    if (!event.requestId || typeof event.requestId !== "string") {
      this.logger.error(
        `[HandlerRegistry] - Missing or invalid requestId on "${eventType}", dropping message`,
      );
      return;
    }

    const globalSchema = this.schemas.get(eventType);
    if (globalSchema) {
      try {
        globalSchema(event.payload);
      } catch (err) {
        this.logger.error(
          `[HandlerRegistry] - Schema validation failed for "${eventType}" (requestId: ${event.requestId}): ${err}`,
        );
        return;
      }
    }

    const localLockKey = `${event.requestId}:${eventType}`;
    if (this.processingLocks.has(localLockKey)) {
      return;
    }

    const dedupeKey = this.dedupeKey(localLockKey);
    const alreadyProcessed = await this.redis.getCache(dedupeKey);
    if (alreadyProcessed === "1") {
      this.logger.debug(
        `[HandlerRegistry] duplicate message ignored for "${eventType}" (requestId: ${event.requestId})`,
      );
      return;
    }

    this.processingLocks.add(localLockKey);
    if (this.processingLocks.size > 1000) {
      this.logger.warn(
        `[HandlerRegistry] - processingLocks size exceeded 1000 (current: ${this.processingLocks.size})`,
      );
    }

    const distributedLockKey = this.distributedLockKey(localLockKey);
    let distributedLockAcquired = false;

    const trackMetrics = !eventType.startsWith("workflow:");

    try {
      distributedLockAcquired = await this.redis.setCacheIfNotExists(
        distributedLockKey,
        "1",
        this.lockTtl,
      );

      if (!distributedLockAcquired) {
        this.logger.debug(
          `[HandlerRegistry] in-flight message ignored for "${eventType}" (requestId: ${event.requestId})`,
        );
        return;
      }

      this.logger.debug(
        `[HandlerRegistry] handleMessage("${eventType}") entries=${entries.size}`,
      );

      if (trackMetrics) {
        await this.redis.incrementCache(`synkro:metrics:${eventType}:received`, this.metricsTtl);
      }

      const results = await Promise.allSettled(
        Array.from(entries).map((entry) =>
          this.executeHandler(eventType, entry, event),
        ),
      );

      const allSucceeded = results.every((r) => r.status === "fulfilled");

      if (trackMetrics) {
        if (allSucceeded) {
          await this.redis.incrementCache(`synkro:metrics:${eventType}:completed`, this.metricsTtl);
        } else {
          await this.redis.incrementCache(`synkro:metrics:${eventType}:failed`, this.metricsTtl);
        }
      }

      const eventPayload: Record<string, unknown> = {
        requestId: event.requestId,
        payload: event.payload,
      };

      if (!allSucceeded) {
        eventPayload.errors = results
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => serializeError(r.reason));
      }

      await this.redis.publishMessage(
        `event:${eventType}:${allSucceeded ? "completed" : "failed"}`,
        JSON.stringify(eventPayload),
      );

      await this.redis.setCache(dedupeKey, "1", this.dedupTtl);
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

    if (entry.schema) {
      entry.schema(event.payload);
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await entry.handler(ctx);
        return;
      } catch (error) {
        const isRetryable = entry.retry?.retryable
          ? entry.retry.retryable(error)
          : true;

        if (attempt < maxRetries && isRetryable) {
          const delay = computeRetryDelay(
            attempt,
            entry.retry?.backoff,
            entry.retry?.delayMs,
            entry.retry?.jitter,
          );
          this.logger.warn(
            `[HandlerRegistry] - Handler "${eventType}" failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`,
          );
          await sleep(delay);
        } else {
          this.logger.error(
            `[HandlerRegistry] - Handler "${eventType}" failed after ${attempt + 1} attempt(s): ${error}`,
          );
          throw error;
        }
      }
    }
  }
}
