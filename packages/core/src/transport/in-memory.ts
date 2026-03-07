import { Logger } from "../logger.js";

import type { TransportManager } from "./transport.js";

export class InMemoryManager implements TransportManager {
  private subscriptions = new Map<string, Set<(message: string) => void>>();
  private cache = new Map<string, string>();
  private cacheExpiry = new Map<string, number>();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger();
  }

  async publishMessage(channel: string, message: string): Promise<void> {
    const callbacks = this.subscriptions.get(channel);
    if (!callbacks) {
      return;
    }

    for (const callback of callbacks) {
      queueMicrotask(() => callback(message));
    }
  }

  subscribeToChannel(
    channel: string,
    callback: (message: string) => void,
  ): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(callback);
    this.logger.debug(`Subscribed to channel "${channel}" (in-memory).`);
  }

  async getCache(key: string): Promise<string | null> {
    this.evictIfExpired(key);
    return this.cache.get(key) ?? null;
  }

  async setCacheIfNotExists(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean> {
    this.evictIfExpired(key);
    if (this.cache.has(key)) {
      return false;
    }

    this.cache.set(key, value);
    this.applyTtl(key, ttlSeconds);
    return true;
  }

  async setCache(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<void> {
    this.cache.set(key, value);
    this.applyTtl(key, ttlSeconds);
  }

  async deleteCache(key: string): Promise<void> {
    this.cache.delete(key);
    this.cacheExpiry.delete(key);
  }

  async incrementCache(key: string, ttlSeconds?: number): Promise<number> {
    this.evictIfExpired(key);
    const current = Number(this.cache.get(key) ?? 0);
    const next = current + 1;
    this.cache.set(key, String(next));
    if (ttlSeconds) {
      this.applyTtl(key, ttlSeconds);
    } else {
      const expiresAt = this.cacheExpiry.get(key);
      if (expiresAt !== undefined) {
        this.cacheExpiry.set(key, expiresAt);
      }
    }
    return next;
  }

  async disconnect(): Promise<void> {
    this.subscriptions.clear();
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  private evictIfExpired(key: string): void {
    const expiresAt = this.cacheExpiry.get(key);
    if (expiresAt !== undefined && Date.now() >= expiresAt) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
    }
  }

  private applyTtl(key: string, ttlSeconds?: number): void {
    if (ttlSeconds && ttlSeconds > 0) {
      this.cacheExpiry.set(key, Date.now() + ttlSeconds * 1000);
      return;
    }

    this.cacheExpiry.delete(key);
  }
}
