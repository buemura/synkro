import { Redis } from "ioredis";

import { logger } from "../logger.js";

import type { TransportManager } from "./transport.js";

export class RedisManager implements TransportManager {
  private publisher: Redis;
  private subscriber: Redis;
  private cacheClient: Redis;
  private channelCallbacks: Map<string, Set<(message: string) => void>> =
    new Map();
  private pendingSubscriptions: string[] = [];
  private flushScheduled = false;
  private recentMessages = new Map<string, number>();
  private static readonly DEDUP_WINDOW_MS = 5_000;
  private static readonly MAX_RECENT_MESSAGES = 10_000;

  constructor(redisUrl: string) {
    this.publisher = this.createClient(redisUrl, "publisher");
    this.subscriber = this.createClient(redisUrl, "subscriber");
    this.cacheClient = this.createClient(redisUrl, "cache");

    this.subscriber.on("message", (channel: string, message: string) => {
      const requestId = this.extractRequestId(message);
      const dedupeKey = requestId ? `${channel}\0${requestId}` : `${channel}\0${message}`;
      const now = Date.now();

      if (this.recentMessages.has(dedupeKey)) {
        return;
      }

      this.recentMessages.set(dedupeKey, now);
      this.evictStaleMessages(now);

      const callbacks = this.channelCallbacks.get(channel);
      if (callbacks) {
        logger.debug(`[RedisManager] message on "${channel}" → ${callbacks.size} callback(s)`);
        for (const callback of callbacks) {
          callback(message);
        }
      }
    });
  }

  async publishMessage(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message);
  }

  subscribeToChannel(
    channel: string,
    callback: (message: string) => void,
  ): void {
    const isNewChannel = !this.channelCallbacks.has(channel);

    if (isNewChannel) {
      this.channelCallbacks.set(channel, new Set());
    }
    this.channelCallbacks.get(channel)!.add(callback);
    logger.debug(`[RedisManager] subscribeToChannel("${channel}") → now ${this.channelCallbacks.get(channel)!.size} callback(s)`);

    if (isNewChannel) {
      this.pendingSubscriptions.push(channel);
      if (!this.flushScheduled) {
        this.flushScheduled = true;
        queueMicrotask(() => this.flushSubscriptions());
      }
    }
  }

  private flushSubscriptions(): void {
    this.flushScheduled = false;
    const channels = this.pendingSubscriptions.splice(0);
    if (channels.length === 0) return;

    this.subscriber
      .subscribe(...channels)
      .then((count) => {
        logger.debug(
          `Subscribed to ${count} channel(s): ${channels.join(", ")}`,
        );
      })
      .catch((err: unknown) => {
        logger.error("Failed to subscribe to channels", { error: String(err) });
      });
  }

  unsubscribeFromChannel(channel: string): void {
    this.channelCallbacks.delete(channel);
    this.subscriber.unsubscribe(channel).catch((err: unknown) => {
      logger.error("[RedisManager] Failed to unsubscribe", { channel, error: String(err) });
    });
  }

  async getCache(key: string): Promise<string | null> {
    return await this.cacheClient.get(key);
  }

  async setCacheIfNotExists(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean> {
    const result = ttlSeconds
      ? await this.cacheClient.set(key, value, "EX", ttlSeconds, "NX")
      : await this.cacheClient.set(key, value, "NX");
    return result === "OK";
  }

  async setCache(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<void> {
    if (ttlSeconds) {
      await this.cacheClient.set(key, value, "EX", ttlSeconds);
    } else {
      await this.cacheClient.set(key, value);
    }
  }

  async deleteCache(key: string): Promise<void> {
    await this.cacheClient.del(key);
  }

  async incrementCache(key: string, ttlSeconds?: number): Promise<number> {
    const value = await this.cacheClient.incr(key);
    if (ttlSeconds) {
      await this.cacheClient.expire(key, ttlSeconds);
    }
    return value;
  }

  async pushToList(key: string, value: string): Promise<void> {
    await this.cacheClient.rpush(key, value);
  }

  async getListRange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.cacheClient.lrange(key, start, stop);
  }

  async deleteKey(key: string): Promise<void> {
    await this.cacheClient.del(key);
  }

  async disconnect(): Promise<void> {
    await this.publisher.quit();
    await this.subscriber.quit();
    await this.cacheClient.quit();
  }

  private createClient(redisUrl: string, role: string): Redis {
    const client = new Redis(redisUrl, {
      retryStrategy(times) {
        const delay = Math.min(times * 500, 5000);
        logger.warn(
          `[RedisManager] ${role} connection retry #${times} in ${delay}ms`,
        );
        return delay;
      },
      maxRetriesPerRequest: null,
    });

    client.on("error", (err: Error) => {
      logger.error("[RedisManager] Connection error", { role, error: err.message });
    });

    client.on("connect", () => {
      logger.debug(`[RedisManager] ${role} connected`);
    });

    return client;
  }

  private static readonly REQUEST_ID_RE = /"requestId":"([^"]+)"/;

  private extractRequestId(message: string): string | null {
    const match = RedisManager.REQUEST_ID_RE.exec(message);
    return match?.[1] ?? null;
  }

  private evictStaleMessages(now: number): void {
    if (this.recentMessages.size <= RedisManager.MAX_RECENT_MESSAGES) return;

    for (const [key, timestamp] of this.recentMessages) {
      if (now - timestamp > RedisManager.DEDUP_WINDOW_MS) {
        this.recentMessages.delete(key);
      }
    }
  }
}
