export interface TransportManager {
  publishMessage(channel: string, message: string): Promise<void>;
  subscribeToChannel(
    channel: string,
    callback: (message: string) => void,
  ): void;
  setCacheIfNotExists(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean>;
  getCache(key: string): Promise<string | null>;
  setCache(key: string, value: string, ttlSeconds?: number): Promise<void>;
  deleteCache(key: string): Promise<void>;
  incrementCache(key: string): Promise<number>;
  disconnect(): Promise<void>;
}
