import { describe, it, expect, vi, beforeEach } from "vitest";
import { HandlerRegistry } from "./handler-registry.js";
import type { RedisManager } from "../transport/redis.js";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createMockRedis(): RedisManager {
  return {
    publishMessage: vi.fn(),
    subscribeToChannel: vi.fn(),
    getCache: vi.fn(),
    setCacheIfNotExists: vi.fn().mockResolvedValue(true),
    setCache: vi.fn().mockResolvedValue(undefined),
    deleteCache: vi.fn(),
    incrementCache: vi.fn().mockResolvedValue(1),
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

    it("should accumulate handlers when same event is registered twice", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register("event", handler1);
      registry.register("event", handler2);

      expect(mockRedis.subscribeToChannel).toHaveBeenCalledTimes(1);

      const events = registry.getRegisteredEvents();
      const eventEntries = events.filter((e) => e.type === "event");
      expect(eventEntries).toHaveLength(2);
    });
  });

  describe("message handling", () => {
    it("should skip processing when distributed lock cannot be acquired", async () => {
      const handler = vi.fn();
      vi.mocked(mockRedis.setCacheIfNotExists).mockResolvedValueOnce(false);
      registry.register("user:created", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      await messageCallback(
        JSON.stringify({
          requestId: "req-locked",
          payload: { name: "Alice" },
        }),
      );

      expect(handler).not.toHaveBeenCalled();
      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });

    it("should skip already processed messages", async () => {
      const handler = vi.fn();
      vi.mocked(mockRedis.getCache).mockResolvedValueOnce("1");
      registry.register("user:created", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      await messageCallback(
        JSON.stringify({
          requestId: "req-processed",
          payload: { name: "Alice" },
        }),
      );

      expect(handler).not.toHaveBeenCalled();
      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });

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

      messageCallback(message);
      await flushPromises();

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

      messageCallback(message);
      await flushPromises();

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:user:created:completed",
        JSON.stringify({
          requestId: "req-123",
          payload: { name: "Alice" },
        }),
      );
    });

    it("should invoke all handlers when multiple are registered for the same event", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registry.register("user:created", handler1);
      registry.register("user:created", handler2);

      // Both subscribeToChannel calls produce callbacks; simulate via the first one
      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-multi",
        payload: { name: "Bob" },
      });

      messageCallback(message);
      await flushPromises();

      expect(handler1).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "req-multi" }),
      );
      expect(handler2).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "req-multi" }),
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

      messageCallback(message);
      await flushPromises();

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

    it("should drop malformed JSON messages", async () => {
      const handler = vi.fn();
      registry.register("user:created", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback("not valid json {{{");
      await flushPromises();

      expect(handler).not.toHaveBeenCalled();
      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });

    it("should drop messages with missing requestId", async () => {
      const handler = vi.fn();
      registry.register("user:created", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(JSON.stringify({ payload: { name: "Alice" } }));
      await flushPromises();

      expect(handler).not.toHaveBeenCalled();
      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });
  });
});
