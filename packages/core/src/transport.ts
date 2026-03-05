export interface TransportManager {
  publishMessage(channel: string, message: string): void;
  subscribeToChannel(
    channel: string,
    callback: (message: string) => void,
  ): void;
  getCache(key: string): Promise<string | null>;
  setCache(key: string, value: string, ttlSeconds?: number): Promise<void>;
  deleteCache(key: string): Promise<void>;
  disconnect(): Promise<void>;
}
