import { Redis } from "ioredis";

import { logger } from "./logger.js";

import type { TransportManager } from "./transport.js";

export class RedisManager implements TransportManager {
  private publisher: Redis;
  private subscriber: Redis;
  private cacheClient: Redis;

  constructor(redisUrl: string) {
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
    this.cacheClient = new Redis(redisUrl);
  }

  publishMessage(channel: string, message: string): void {
    this.publisher.publish(channel, message);
  }

  subscribeToChannel(
    channel: string,
    callback: (message: string) => void,
  ): void {
    this.subscriber
      .subscribe(channel)
      .then((count) => {
        logger.debug(
          `Subscribed to ${count} channel(s). Listening on "${channel}".`,
        );
      })
      .catch((err: unknown) => {
        logger.error(`Failed to subscribe to channel ${channel}:`, err);
      });

    this.subscriber.on("message", (chan: string, message: string) => {
      if (chan === channel) {
        callback(message);
      }
    });
  }

  async getCache(key: string): Promise<string | null> {
    return await this.cacheClient.get(key);
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

  async disconnect(): Promise<void> {
    await this.publisher.quit();
    await this.subscriber.quit();
    await this.cacheClient.quit();
  }
}
