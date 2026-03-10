import { createHmac } from "node:crypto";

import type { TransportManager } from "@synkro/core";

export type HandlerRoute = {
  eventType: string;
  url: string;
};

export type HttpTransportOptions = {
  /** Redis connection URL for cache operations (locking, dedup, state, metrics). */
  redisUrl: string;
  /** The app's public base URL (e.g., "https://myapp.vercel.app"). */
  baseUrl: string;
  /** Maps event types to HTTP route paths. */
  handlerRoutes?: HandlerRoute[];
  /** HMAC secret for signing HTTP requests to handler routes. */
  secret?: string;
};

/**
 * A TransportManager implementation for serverless environments.
 *
 * Uses Redis for all cache operations (locking, dedup, state, metrics)
 * but replaces pub/sub with HTTP POST calls to registered route handler URLs.
 *
 * `subscribeToChannel` is a no-op — in serverless mode, "subscribers" are
 * HTTP route handlers created with `createEventHandler` / `createWorkflowStepHandler`.
 */
export class HttpTransportManager implements TransportManager {
  private redis: import("ioredis").Redis | null = null;
  private redisPromise: Promise<import("ioredis").Redis> | null = null;
  private routeMap: Map<string, string>;
  private readonly redisUrl: string;
  private readonly baseUrl: string;
  private readonly secret?: string;

  constructor(options: HttpTransportOptions) {
    this.redisUrl = options.redisUrl;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.secret = options.secret;
    this.routeMap = new Map();
    for (const route of options.handlerRoutes ?? []) {
      this.routeMap.set(route.eventType, route.url);
    }
  }

  registerRoute(eventType: string, url: string): void {
    this.routeMap.set(eventType, url);
  }

  private async getRedis(): Promise<import("ioredis").Redis> {
    if (this.redis) return this.redis;
    if (this.redisPromise) return this.redisPromise;

    this.redisPromise = import("ioredis").then(({ Redis }) => {
      this.redis = new Redis(this.redisUrl, {
        maxRetriesPerRequest: null,
      });
      return this.redis;
    });

    return this.redisPromise;
  }

  async publishMessage(channel: string, message: string): Promise<void> {
    const url = this.routeMap.get(channel);

    if (!url) {
      // No HTTP handler registered for this channel.
      // Fall back to Redis pub/sub for internal signaling
      // (e.g., workflow completion events consumed by other routes).
      const redis = await this.getRedis();
      await redis.publish(channel, message);
      return;
    }

    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.secret) {
      const signature = createHmac("sha256", this.secret)
        .update(message)
        .digest("hex");
      headers["x-synkro-signature"] = signature;
    }

    try {
      const response = await fetch(fullUrl, {
        method: "POST",
        headers,
        body: message,
      });
      if (!response.ok) {
        console.error(
          `[HttpTransport] POST ${fullUrl} returned ${response.status}`,
        );
      }
    } catch (err) {
      console.error(`[HttpTransport] POST ${fullUrl} failed:`, err);
    }
  }

  subscribeToChannel(
    _channel: string,
    _callback: (message: string) => void,
  ): void {
    // No-op in serverless: handlers are HTTP route handlers, not subscribers.
  }

  unsubscribeFromChannel(_channel: string): void {
    // No-op in serverless.
  }

  async setCacheIfNotExists(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean> {
    const redis = await this.getRedis();
    const result = ttlSeconds
      ? await redis.set(key, value, "EX", ttlSeconds, "NX")
      : await redis.set(key, value, "NX");
    return result === "OK";
  }

  async getCache(key: string): Promise<string | null> {
    const redis = await this.getRedis();
    return redis.get(key);
  }

  async setCache(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<void> {
    const redis = await this.getRedis();
    if (ttlSeconds) {
      await redis.set(key, value, "EX", ttlSeconds);
    } else {
      await redis.set(key, value);
    }
  }

  async deleteCache(key: string): Promise<void> {
    const redis = await this.getRedis();
    await redis.del(key);
  }

  async incrementCache(key: string, ttlSeconds?: number): Promise<number> {
    const redis = await this.getRedis();
    const value = await redis.incr(key);
    if (ttlSeconds) {
      await redis.expire(key, ttlSeconds);
    }
    return value;
  }

  async pushToList(key: string, value: string): Promise<void> {
    const redis = await this.getRedis();
    await redis.rpush(key, value);
  }

  async getListRange(key: string, start: number, stop: number): Promise<string[]> {
    const redis = await this.getRedis();
    return redis.lrange(key, start, stop);
  }

  async deleteKey(key: string): Promise<void> {
    const redis = await this.getRedis();
    await redis.del(key);
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.redisPromise = null;
    }
  }
}
