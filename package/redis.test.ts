import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisManager } from "./redis.js";

const mockPublish = vi.fn();
const mockSubscribe = vi.fn().mockResolvedValue(1);
const mockOn = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockQuit = vi.fn().mockResolvedValue("OK");

vi.mock("ioredis", () => {
  class MockRedis {
    publish = mockPublish;
    subscribe = mockSubscribe;
    on = mockOn;
    get = mockGet;
    set = mockSet;
    del = mockDel;
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
    it("should publish a message to the given channel", () => {
      redis.publishMessage("test-channel", '{"data":"value"}');
      expect(mockPublish).toHaveBeenCalledWith(
        "test-channel",
        '{"data":"value"}',
      );
    });
  });

  describe("subscribeToChannel", () => {
    it("should subscribe to the channel", () => {
      const callback = vi.fn();
      redis.subscribeToChannel("my-channel", callback);
      expect(mockSubscribe).toHaveBeenCalledWith("my-channel");
    });

    it("should invoke callback when message arrives on matching channel", () => {
      const callback = vi.fn();
      redis.subscribeToChannel("my-channel", callback);

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

    it("should not invoke callback for a different channel", () => {
      const callback = vi.fn();
      redis.subscribeToChannel("my-channel", callback);

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

  describe("disconnect", () => {
    it("should quit all three Redis clients", async () => {
      await redis.disconnect();
      expect(mockQuit).toHaveBeenCalledTimes(3);
    });
  });
});
