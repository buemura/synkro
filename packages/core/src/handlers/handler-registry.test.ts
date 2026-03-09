import { describe, it, expect, vi, beforeEach } from "vitest";
import { HandlerRegistry } from "./handler-registry.js";
import type { RedisManager } from "../transport/redis.js";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createMockRedis(): RedisManager {
  return {
    publishMessage: vi.fn().mockResolvedValue(undefined),
    subscribeToChannel: vi.fn(),
    unsubscribeFromChannel: vi.fn(),
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
      vi.useFakeTimers();
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
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:user:created:failed",
        JSON.stringify({
          requestId: "req-123",
          payload: { name: "Alice" },
          errors: [{ message: "fail", name: "Error" }],
        }),
      );
      vi.useRealTimers();
    });

    it("should serialize non-Error thrown values in failure events", async () => {
      const handler = vi.fn().mockRejectedValue("string error");
      registry.register("user:created", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(
        JSON.stringify({ requestId: "req-str-err", payload: {} }),
      );
      await flushPromises();

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:user:created:failed",
        JSON.stringify({
          requestId: "req-str-err",
          payload: {},
          errors: [{ message: "string error" }],
        }),
      );
    });

    it("should not include errors field in completion events", async () => {
      const handler = vi.fn();
      registry.register("user:created", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(
        JSON.stringify({ requestId: "req-ok", payload: {} }),
      );
      await flushPromises();

      const publishCall = vi.mocked(mockRedis.publishMessage).mock.calls[0]!;
      const published = JSON.parse(publishCall[1] as string) as Record<string, unknown>;
      expect(published).not.toHaveProperty("errors");
    });

    it("should not publish failure event if handler succeeds after retry", async () => {
      vi.useFakeTimers();
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
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);

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
      vi.useRealTimers();
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

    it("should apply fixed delay between retries", async () => {
      vi.useFakeTimers();
      const handler = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(undefined);
      registry.register("user:created", handler, {
        maxRetries: 1,
        delayMs: 500,
      });

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-fixed",
        payload: { name: "Alice" },
      });

      messageCallback(message);

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(handler).toHaveBeenCalledTimes(1);

      // Advance past the 500ms delay
      await vi.advanceTimersByTimeAsync(500);
      expect(handler).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should apply exponential backoff between retries", async () => {
      vi.useFakeTimers();
      const handler = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(undefined);
      registry.register("user:created", handler, {
        maxRetries: 2,
        delayMs: 100,
        backoff: "exponential",
      });

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-exp",
        payload: {},
      });

      messageCallback(message);

      // First attempt fails
      await vi.advanceTimersByTimeAsync(0);
      expect(handler).toHaveBeenCalledTimes(1);

      // First retry: 100 * 2^0 = 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(handler).toHaveBeenCalledTimes(2);

      // Second retry: 100 * 2^1 = 200ms
      await vi.advanceTimersByTimeAsync(200);
      expect(handler).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it("should apply jitter to retry delay", async () => {
      vi.useFakeTimers();
      const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

      const handler = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(undefined);
      registry.register("user:created", handler, {
        maxRetries: 1,
        delayMs: 1000,
        jitter: true,
      });

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-jitter",
        payload: {},
      });

      messageCallback(message);

      // First attempt fails
      await vi.advanceTimersByTimeAsync(0);
      expect(handler).toHaveBeenCalledTimes(1);

      // Jitter with Math.random()=0.5: 1000 * (0.5 + 0.5) = 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(handler).toHaveBeenCalledTimes(2);

      mathRandomSpy.mockRestore();
      vi.useRealTimers();
    });

    it("should not retry when retryable predicate returns false", async () => {
      const handler = vi
        .fn()
        .mockRejectedValue(new Error("non-retryable"));
      registry.register("user:created", handler, {
        maxRetries: 3,
        retryable: (error) =>
          error instanceof Error && error.message !== "non-retryable",
      });

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-noretry",
        payload: {},
      });

      messageCallback(message);
      await flushPromises();

      // Should only attempt once — retryable returned false
      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:user:created:failed",
        expect.any(String),
      );
    });

    it("should retry when retryable predicate returns true", async () => {
      vi.useFakeTimers();
      const handler = vi
        .fn()
        .mockRejectedValueOnce(new Error("retryable"))
        .mockResolvedValueOnce(undefined);
      registry.register("user:created", handler, {
        maxRetries: 1,
        delayMs: 100,
        retryable: () => true,
      });

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-retryable",
        payload: {},
      });

      messageCallback(message);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should use default 1000ms delay when delayMs is not specified", async () => {
      vi.useFakeTimers();
      const handler = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(undefined);
      registry.register("user:created", handler, { maxRetries: 1 });

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-default-delay",
        payload: {},
      });

      messageCallback(message);

      await vi.advanceTimersByTimeAsync(0);
      expect(handler).toHaveBeenCalledTimes(1);

      // Should not have retried yet at 999ms
      await vi.advanceTimersByTimeAsync(999);
      expect(handler).toHaveBeenCalledTimes(1);

      // Should retry at 1000ms
      await vi.advanceTimersByTimeAsync(1);
      expect(handler).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
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

  describe("retention config", () => {
    it("should use custom lockTtl for distributed lock", async () => {
      const customRedis = createMockRedis();
      const customRegistry = new HandlerRegistry(customRedis, { lockTtl: 60 });
      customRegistry.setPublishFn(vi.fn().mockResolvedValue("id"));

      const handler = vi.fn();
      customRegistry.register("test:event", handler);

      const subscribeCall = vi.mocked(customRedis.subscribeToChannel).mock.calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(JSON.stringify({ requestId: "req-ttl", payload: {} }));
      await flushPromises();

      expect(customRedis.setCacheIfNotExists).toHaveBeenCalledWith(
        "synkro:lock:handler:req-ttl:test:event",
        "1",
        60,
      );
    });

    it("should use custom dedupTtl for deduplication key", async () => {
      const customRedis = createMockRedis();
      const customRegistry = new HandlerRegistry(customRedis, { dedupTtl: 3600 });
      customRegistry.setPublishFn(vi.fn().mockResolvedValue("id"));

      const handler = vi.fn();
      customRegistry.register("test:event", handler);

      const subscribeCall = vi.mocked(customRedis.subscribeToChannel).mock.calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(JSON.stringify({ requestId: "req-dedup", payload: {} }));
      await flushPromises();

      expect(customRedis.setCache).toHaveBeenCalledWith(
        "synkro:dedupe:handler:req-dedup:test:event",
        "1",
        3600,
      );
    });

    it("should pass metricsTtl to incrementCache", async () => {
      const customRedis = createMockRedis();
      const customRegistry = new HandlerRegistry(customRedis, { metricsTtl: 7200 });
      customRegistry.setPublishFn(vi.fn().mockResolvedValue("id"));

      const handler = vi.fn();
      customRegistry.register("test:event", handler);

      const subscribeCall = vi.mocked(customRedis.subscribeToChannel).mock.calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(JSON.stringify({ requestId: "req-metrics", payload: {} }));
      await flushPromises();

      expect(customRedis.incrementCache).toHaveBeenCalledWith(
        "synkro:metrics:test:event:received",
        7200,
      );
      expect(customRedis.incrementCache).toHaveBeenCalledWith(
        "synkro:metrics:test:event:completed",
        7200,
      );
    });

    it("should pass undefined metricsTtl when not configured", async () => {
      const handler = vi.fn();
      registry.register("test:event", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock.calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(JSON.stringify({ requestId: "req-no-ttl", payload: {} }));
      await flushPromises();

      expect(mockRedis.incrementCache).toHaveBeenCalledWith(
        "synkro:metrics:test:event:received",
        undefined,
      );
    });
  });

  describe("unregister", () => {
    it("should remove a specific handler by reference", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registry.register("test:event", handler1);
      registry.register("test:event", handler2);

      registry.unregister("test:event", handler1);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock.calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(JSON.stringify({ requestId: "req-unreg", payload: {} }));
      await flushPromises();

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it("should remove all handlers when no handlerFn provided", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registry.register("test:event", handler1);
      registry.register("test:event", handler2);

      registry.unregister("test:event");

      const events = registry.getRegisteredEvents();
      expect(events.filter((e) => e.type === "test:event")).toHaveLength(0);
    });

    it("should unsubscribe from channel when last handler is removed", () => {
      const handler = vi.fn();
      registry.register("test:event", handler);

      registry.unregister("test:event", handler);

      expect(mockRedis.unsubscribeFromChannel).toHaveBeenCalledWith("test:event");
    });

    it("should not unsubscribe from channel when handlers remain", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registry.register("test:event", handler1);
      registry.register("test:event", handler2);

      registry.unregister("test:event", handler1);

      expect(mockRedis.unsubscribeFromChannel).not.toHaveBeenCalled();
    });

    it("should be a no-op for unknown event types", () => {
      registry.unregister("unknown:event");
      expect(mockRedis.unsubscribeFromChannel).not.toHaveBeenCalled();
    });
  });

  describe("schema validation", () => {
    it("should drop message when global schema validation fails", async () => {
      const handler = vi.fn();
      registry.registerSchema("user:created", (payload) => {
        if (!payload || typeof payload !== "object" || !("name" in payload)) {
          throw new Error("missing name");
        }
      });
      registry.register("user:created", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock.calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(JSON.stringify({ requestId: "req-invalid", payload: { age: 25 } }));
      await flushPromises();

      expect(handler).not.toHaveBeenCalled();
      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });

    it("should pass message when global schema validation succeeds", async () => {
      const handler = vi.fn();
      registry.registerSchema("user:created", (payload) => {
        if (!payload || typeof payload !== "object" || !("name" in payload)) {
          throw new Error("missing name");
        }
      });
      registry.register("user:created", handler);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock.calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(JSON.stringify({ requestId: "req-valid", payload: { name: "Alice" } }));
      await flushPromises();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ payload: { name: "Alice" } }),
      );
    });

    it("should fail handler when per-entry schema validation fails", async () => {
      const handler = vi.fn();
      const schema = (payload: unknown) => {
        if (!payload || typeof payload !== "object" || !("email" in payload)) {
          throw new Error("missing email");
        }
      };
      registry.register("user:created", handler, undefined, schema);

      const subscribeCall = vi.mocked(mockRedis.subscribeToChannel).mock.calls[0]!;
      const messageCallback = subscribeCall[1] as (message: string) => void;

      messageCallback(JSON.stringify({ requestId: "req-no-email", payload: { name: "Alice" } }));
      await flushPromises();

      expect(handler).not.toHaveBeenCalled();
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:user:created:failed",
        expect.any(String),
      );
    });

    it("should return schema via getSchema", () => {
      const schema = vi.fn();
      registry.registerSchema("test:event", schema);
      expect(registry.getSchema("test:event")).toBe(schema);
    });

    it("should return undefined for unregistered schema", () => {
      expect(registry.getSchema("unknown:event")).toBeUndefined();
    });
  });
});
