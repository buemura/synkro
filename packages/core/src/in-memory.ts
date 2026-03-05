import { logger } from "./logger.js";

import type { TransportManager } from "./transport.js";

export class InMemoryManager implements TransportManager {
  private subscriptions = new Map<string, Set<(message: string) => void>>();
  private cache = new Map<string, string>();

  publishMessage(channel: string, message: string): void {
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
    logger.debug(`Subscribed to channel "${channel}" (in-memory).`);
  }

  async getCache(key: string): Promise<string | null> {
    return this.cache.get(key) ?? null;
  }

  async setCache(
    key: string,
    value: string,
    _ttlSeconds?: number,
  ): Promise<void> {
    this.cache.set(key, value);
  }

  async deleteCache(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async disconnect(): Promise<void> {
    this.subscriptions.clear();
    this.cache.clear();
  }
}
