import { describe, it, expect, vi, beforeEach } from "vitest";
import { HandlerRegistry } from "./handler-registry.js";
import type { RedisManager } from "./redis.js";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createMockRedis(): RedisManager {
  return {
    publishMessage: vi.fn(),
    subscribeToChannel: vi.fn(),
    getCache: vi.fn(),
    setCache: vi.fn(),
    deleteCache: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as RedisManager;
}

describe("HandlerRegistry", () => {
  let registry: HandlerRegistry;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
    registry = new HandlerRegistry(mockRedis);
  });

  describe("register", () => {
    it("should subscribe to the event channel on Redis", () => {
      const handler = vi.fn();
      registry.register("user:created", handler);

      expect(mockRedis.subscribeToChannel).toHaveBeenCalledWith(
        "user:created",
        expect.any(Function),
      );
    });

    it("should overwrite handler if same event is registered twice", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register("event", handler1);
      registry.register("event", handler2);

      expect(mockRedis.subscribeToChannel).toHaveBeenCalledTimes(2);
    });
  });

  describe("message handling", () => {
    it("should invoke the handler when a message is received", async () => {
      const handler = vi.fn();
      registry.register("user:created", handler);

      // Get the callback passed to subscribeToChannel
      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-123",
        payload: { name: "Alice" },
      });

      await messageCallback(message);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-123",
          payload: { name: "Alice" },
        }),
      );
    });

    it("should publish a completion event after handler executes", async () => {
      const handler = vi.fn();
      registry.register("user:created", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-123",
        payload: { name: "Alice" },
      });

      await messageCallback(message);

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:user:created:completed",
        JSON.stringify({
          requestId: "req-123",
          payload: { name: "Alice" },
        }),
      );
    });

    it("should handle async handlers", async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.register("async-event", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-456",
        payload: null,
      });

      await messageCallback(message);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-456",
          payload: null,
        }),
      );
      expect(mockRedis.publishMessage).toHaveBeenCalled();
    });

    it("should publish a failure event after all retries are exhausted", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("fail"));
      registry.register("user:created", handler, { maxRetries: 1 });

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-123",
        payload: { name: "Alice" },
      });

      messageCallback(message);
      await flushPromises();

      expect(handler).toHaveBeenCalledTimes(2);
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:user:created:failed",
        JSON.stringify({
          requestId: "req-123",
          payload: { name: "Alice" },
        }),
      );
    });

    it("should not publish failure event if handler succeeds after retry", async () => {
      const handler = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(undefined);
      registry.register("user:created", handler, { maxRetries: 1 });

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-123",
        payload: { name: "Alice" },
      });

      messageCallback(message);
      await flushPromises();

      expect(handler).toHaveBeenCalledTimes(2);
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:user:created:completed",
        JSON.stringify({
          requestId: "req-123",
          payload: { name: "Alice" },
        }),
      );
      expect(mockRedis.publishMessage).not.toHaveBeenCalledWith(
        "event:user:created:failed",
        expect.any(String),
      );
    });
  });
});
