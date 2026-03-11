import { Logger } from "../logger.js";

import type { TransportManager } from "../transport/transport.js";
import { composeMiddleware } from "../middleware.js";

import type {
  DeadLetterItem,
  EventFilter,
  HandlerCtx,
  HandlerFunction,
  MiddlewareFunction,
  PublishFunction,
  RetentionConfig,
  RetryBackoffStrategy,
  RetryConfig,
  SchemaValidator,
} from "../types.js";

const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_LOCK_TTL = 300;
const DEFAULT_DEDUPE_TTL = 86400;

export type ExecuteHandlerOptions = {
  transport: TransportManager;
  eventType: string;
  requestId: string;
  payload: unknown;
  handler: HandlerFunction;
  publishFn: PublishFunction;
  retry?: RetryConfig;
  schema?: SchemaValidator;
  filter?: EventFilter;
  retention?: RetentionConfig;
  trackMetrics?: boolean;
  dlqEnabled?: boolean;
  middlewares?: MiddlewareFunction[];
  logger?: Logger;
};

export type ExecuteHandlerResult = {
  success: boolean;
  error?: { message: string; name?: string };
};

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

/**
 * Executes a handler with full deduplication, distributed locking,
 * retry logic, metrics tracking, and completion/failure event publication.
 *
 * This is the same logic used by HandlerRegistry.handleMessage, extracted
 * into a standalone function for use in serverless environments (e.g., Next.js
 * route handlers) where persistent subscriptions are not available.
 */
export async function executeHandler(options: ExecuteHandlerOptions): Promise<ExecuteHandlerResult> {
  const {
    transport,
    eventType,
    requestId,
    payload,
    handler,
    publishFn,
    retry,
    schema,
    filter,
    retention,
    trackMetrics = !eventType.startsWith("workflow:"),
    logger = new Logger(),
  } = options;

  // Apply filter before any locking/dedup work
  if (filter && !filter(payload)) {
    logger.debug("[executeHandler] Handler filtered out", {
      eventType,
      requestId,
    });
    return { success: true };
  }

  const lockTtl = retention?.lockTtl ?? DEFAULT_LOCK_TTL;
  const dedupTtl = retention?.dedupTtl ?? DEFAULT_DEDUPE_TTL;
  const metricsTtl = retention?.metricsTtl;

  const lockKey = `${requestId}:${eventType}`;
  const dedupeKey = `synkro:dedupe:handler:${lockKey}`;
  const distributedLockKey = `synkro:lock:handler:${lockKey}`;

  // Check dedup
  const alreadyProcessed = await transport.getCache(dedupeKey);
  if (alreadyProcessed === "1") {
    logger.debug("[executeHandler] Duplicate message ignored", {
      eventType,
      requestId,
    });
    return { success: true };
  }

  // Acquire distributed lock
  const lockAcquired = await transport.setCacheIfNotExists(
    distributedLockKey,
    "1",
    lockTtl,
  );

  if (!lockAcquired) {
    logger.debug("[executeHandler] In-flight message ignored", {
      eventType,
      requestId,
    });
    return { success: true };
  }

  try {
    if (trackMetrics) {
      await transport.incrementCache(`synkro:metrics:${eventType}:received`, metricsTtl);
    }

    // Validate schema
    if (schema) {
      schema(payload);
    }

    // Build handler context
    const ctx: HandlerCtx = {
      requestId,
      payload,
      publish: publishFn,
      setPayload(data: Record<string, unknown>) {
        ctx.payload =
          typeof ctx.payload === "object" && ctx.payload !== null
            ? { ...ctx.payload, ...data }
            : data;
      },
    };

    // Execute with retry
    const maxRetries = retry?.maxRetries ?? 0;
    let lastError: unknown;

    const runHandler = options.middlewares && options.middlewares.length > 0
      ? () => composeMiddleware(options.middlewares!)({ ...ctx, eventType }, async () => { await handler(ctx); })
      : async () => { await handler(ctx); };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await runHandler();
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        const isRetryable = retry?.retryable ? retry.retryable(error) : true;

        if (attempt < maxRetries && isRetryable) {
          const delay = computeRetryDelay(
            attempt,
            retry?.backoff,
            retry?.delayMs,
            retry?.jitter,
          );
          logger.warn("[executeHandler] Handler failed, retrying", {
            eventType,
            requestId,
            attempt: attempt + 1,
            maxAttempts: maxRetries + 1,
            delayMs: delay,
          });
          await sleep(delay);
        } else {
          logger.error("[executeHandler] Handler failed", {
            eventType,
            requestId,
            attempt: attempt + 1,
            maxAttempts: maxRetries + 1,
            error: String(error),
          });
        }
      }
    }

    const success = lastError === undefined;

    if (trackMetrics) {
      if (success) {
        await transport.incrementCache(`synkro:metrics:${eventType}:completed`, metricsTtl);
      } else {
        await transport.incrementCache(`synkro:metrics:${eventType}:failed`, metricsTtl);
      }
    }

    // Publish completion/failure event
    const eventPayload: Record<string, unknown> = {
      requestId,
      payload: ctx.payload,
    };

    const errors = !success ? [serializeError(lastError)] : undefined;

    if (errors) {
      eventPayload.errors = errors;
    }

    await transport.publishMessage(
      `event:${eventType}:${success ? "completed" : "failed"}`,
      JSON.stringify(eventPayload),
    );

    // Push to dead letter queue on failure
    if (!success && options.dlqEnabled && trackMetrics) {
      const dlqItem: DeadLetterItem = {
        eventType,
        requestId,
        payload,
        errors: errors!,
        failedAt: new Date().toISOString(),
        attempts: (retry?.maxRetries ?? 0) + 1,
      };
      await transport.pushToList(
        `synkro:dlq:${eventType}`,
        JSON.stringify(dlqItem),
      );
      logger.debug("[executeHandler] Event pushed to DLQ", {
        eventType,
        requestId,
      });
    }

    // Mark as processed
    await transport.setCache(dedupeKey, "1", dedupTtl);

    if (!success) {
      return { success: false, error: serializeError(lastError) };
    }

    return { success: true };
  } finally {
    await transport.deleteCache(distributedLockKey);
  }
}
