export interface TransportManager {
  publishMessage(channel: string, message: string): Promise<void>;
  subscribeToChannel(
    channel: string,
    callback: (message: string) => void,
  ): void;
  unsubscribeFromChannel(channel: string): void;
  setCacheIfNotExists(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean>;
  getCache(key: string): Promise<string | null>;
  setCache(key: string, value: string, ttlSeconds?: number): Promise<void>;
  deleteCache(key: string): Promise<void>;
  incrementCache(key: string, ttlSeconds?: number): Promise<number>;
  pushToList(key: string, value: string): Promise<void>;
  getListRange(key: string, start: number, stop: number): Promise<string[]>;
  deleteKey(key: string): Promise<void>;
  disconnect(): Promise<void>;
}
