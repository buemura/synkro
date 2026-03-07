import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisManager } from "./redis.js";

const mockPublish = vi.fn().mockResolvedValue(1);
const mockSubscribe = vi.fn().mockResolvedValue(1);
const mockOn = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockIncr = vi.fn().mockResolvedValue(1);
const mockQuit = vi.fn().mockResolvedValue("OK");

vi.mock("ioredis", () => {
  class MockRedis {
    publish = mockPublish;
    subscribe = mockSubscribe;
    on = mockOn;
    get = mockGet;
    set = mockSet;
    del = mockDel;
    incr = mockIncr;
    quit = mockQuit;
  }
  return { Redis: MockRedis };
});

describe("RedisManager", () => {
  let redis: RedisManager;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = new RedisManager("redis://localhost:6379");
  });

  describe("publishMessage", () => {
    it("should publish a message to the given channel", async () => {
      await redis.publishMessage("test-channel", '{"data":"value"}');
      expect(mockPublish).toHaveBeenCalledWith(
        "test-channel",
        '{"data":"value"}',
      );
    });

    it("should propagate errors from redis publish", async () => {
      mockPublish.mockRejectedValueOnce(new Error("connection lost"));
      await expect(
        redis.publishMessage("test-channel", '{"data":"value"}'),
      ).rejects.toThrow("connection lost");
    });
  });

  describe("subscribeToChannel", () => {
    it("should batch-subscribe to channels via microtask", async () => {
      const callback = vi.fn();
      redis.subscribeToChannel("my-channel", callback);

      // subscribe is batched via microtask, not called synchronously
      expect(mockSubscribe).not.toHaveBeenCalled();

      // Flush the microtask queue
      await Promise.resolve();

      expect(mockSubscribe).toHaveBeenCalledWith("my-channel");
    });

    it("should batch multiple channels into a single subscribe call", async () => {
      redis.subscribeToChannel("channel-a", vi.fn());
      redis.subscribeToChannel("channel-b", vi.fn());
      redis.subscribeToChannel("channel-c", vi.fn());

      await Promise.resolve();

      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(mockSubscribe).toHaveBeenCalledWith(
        "channel-a",
        "channel-b",
        "channel-c",
      );
    });

    it("should invoke callback when message arrives on matching channel", async () => {
      const callback = vi.fn();
      redis.subscribeToChannel("my-channel", callback);
      await Promise.resolve();

      // Capture the "message" event handler registered via `on`
      const onCall = mockOn.mock.calls.find(
        (call) => call[0] === "message",
      );
      expect(onCall).toBeDefined();

      const messageHandler = onCall![1] as (
        channel: string,
        message: string,
      ) => void;

      messageHandler("my-channel", "hello");
      expect(callback).toHaveBeenCalledWith("hello");
    });

    it("should fan out to multiple callbacks on the same channel", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      redis.subscribeToChannel("my-channel", callback1);
      redis.subscribeToChannel("my-channel", callback2);

      await Promise.resolve();

      // Redis subscribe should only be called once for the same channel
      expect(mockSubscribe).toHaveBeenCalledTimes(1);

      const onCall = mockOn.mock.calls.find(
        (call) => call[0] === "message",
      );
      const messageHandler = onCall![1] as (
        channel: string,
        message: string,
      ) => void;

      messageHandler("my-channel", "hello");
      expect(callback1).toHaveBeenCalledWith("hello");
      expect(callback2).toHaveBeenCalledWith("hello");
    });

    it("should ignore duplicate messages on the same channel", async () => {
      const callback = vi.fn();
      redis.subscribeToChannel("my-channel", callback);
      await Promise.resolve();

      const onCall = mockOn.mock.calls.find(
        (call) => call[0] === "message",
      );
      const messageHandler = onCall![1] as (
        channel: string,
        message: string,
      ) => void;

      messageHandler("my-channel", '{"requestId":"abc","payload":{}}');
      messageHandler("my-channel", '{"requestId":"abc","payload":{}}');
      messageHandler("my-channel", '{"requestId":"abc","payload":{}}');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should ignore duplicate messages with same requestId but different payload", async () => {
      const callback = vi.fn();
      redis.subscribeToChannel("my-channel", callback);
      await Promise.resolve();

      const onCall = mockOn.mock.calls.find(
        (call) => call[0] === "message",
      );
      const messageHandler = onCall![1] as (
        channel: string,
        message: string,
      ) => void;

      messageHandler("my-channel", '{"requestId":"abc","payload":{"v":1}}');
      messageHandler("my-channel", '{"requestId":"abc","payload":{"v":2}}');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should allow same message on different channels", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      redis.subscribeToChannel("channel-a", callback1);
      redis.subscribeToChannel("channel-b", callback2);
      await Promise.resolve();

      const onCall = mockOn.mock.calls.find(
        (call) => call[0] === "message",
      );
      const messageHandler = onCall![1] as (
        channel: string,
        message: string,
      ) => void;

      const msg = '{"requestId":"abc","payload":{}}';
      messageHandler("channel-a", msg);
      messageHandler("channel-b", msg);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("should not invoke callback for a different channel", async () => {
      const callback = vi.fn();
      redis.subscribeToChannel("my-channel", callback);
      await Promise.resolve();

      const onCall = mockOn.mock.calls.find(
        (call) => call[0] === "message",
      );
      const messageHandler = onCall![1] as (
        channel: string,
        message: string,
      ) => void;

      messageHandler("other-channel", "hello");
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("cache operations", () => {
    it("should set a value only when key does not exist", async () => {
      mockSet.mockResolvedValueOnce("OK");
      const claimed = await redis.setCacheIfNotExists("key", "value", 60);

      expect(claimed).toBe(true);
      expect(mockSet).toHaveBeenCalledWith("key", "value", "EX", 60, "NX");
    });

    it("should return false when key already exists", async () => {
      mockSet.mockResolvedValueOnce(null);
      const claimed = await redis.setCacheIfNotExists("key", "value");

      expect(claimed).toBe(false);
      expect(mockSet).toHaveBeenCalledWith("key", "value", "NX");
    });

    it("should get a cached value", async () => {
      mockGet.mockResolvedValue("cached-value");
      const result = await redis.getCache("key");
      expect(result).toBe("cached-value");
      expect(mockGet).toHaveBeenCalledWith("key");
    });

    it("should return null for missing key", async () => {
      mockGet.mockResolvedValue(null);
      const result = await redis.getCache("missing");
      expect(result).toBeNull();
    });

    it("should set a cached value without TTL", async () => {
      await redis.setCache("key", "value");
      expect(mockSet).toHaveBeenCalledWith("key", "value");
    });

    it("should set a cached value with TTL", async () => {
      await redis.setCache("key", "value", 3600);
      expect(mockSet).toHaveBeenCalledWith("key", "value", "EX", 3600);
    });

    it("should delete a cached value", async () => {
      await redis.deleteCache("key");
      expect(mockDel).toHaveBeenCalledWith("key");
    });
  });

  describe("connection error handling", () => {
    it("should register error and connect event handlers on all clients", () => {
      const onCalls = mockOn.mock.calls;
      const errorHandlers = onCalls.filter((call) => call[0] === "error");
      const connectHandlers = onCalls.filter((call) => call[0] === "connect");

      // 3 clients × 1 error handler each
      expect(errorHandlers.length).toBe(3);
      // 3 clients × 1 connect handler each
      expect(connectHandlers.length).toBe(3);
    });
  });

  describe("disconnect", () => {
    it("should quit all three Redis clients", async () => {
      await redis.disconnect();
      expect(mockQuit).toHaveBeenCalledTimes(3);
    });
  });
});
