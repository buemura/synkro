import { logger } from "./logger.js";

import type { RedisManager } from "./redis.js";
import type { HandlerCtx, HandlerFunction, RetryConfig } from "./types.js";

type HandlerEntry = {
  handler: HandlerFunction;
  retry?: RetryConfig;
};

export class HandlerRegistry {
  private handlers = new Map<string, HandlerEntry>();

  constructor(private redis: RedisManager) {}

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

    const event = JSON.parse(message) as HandlerCtx;
    const maxRetries = entry.retry?.maxRetries ?? 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await entry.handler({
          requestId: event.requestId,
          payload: event.payload,
        });

        this.redis.publishMessage(
          `event:${eventType}:completed`,
          JSON.stringify({
            requestId: event.requestId,
            payload: event.payload,
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
              requestId: event.requestId,
              payload: event.payload,
            }),
          );
        }
      }
    }
  }
}
