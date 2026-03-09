import { describe, expect, it, vi, beforeEach } from "vitest";

import { HttpTransportManager } from "./http-transport.js";

// Mock ioredis
const mockRedis = {
  publish: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  quit: vi.fn().mockResolvedValue("OK"),
};

vi.mock("ioredis", () => {
  return {
    Redis: class MockRedis {
      constructor() {
        return mockRedis;
      }
    },
  };
});

// Mock global fetch
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
});
vi.stubGlobal("fetch", mockFetch);

describe("HttpTransportManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should POST to registered route when publishing", async () => {
    const transport = new HttpTransportManager({
      redisUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
      handlerRoutes: [
        { eventType: "user.created", url: "/api/events/user-created" },
      ],
    });

    await transport.publishMessage(
      "user.created",
      JSON.stringify({ requestId: "req-1", payload: {} }),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://myapp.vercel.app/api/events/user-created",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ requestId: "req-1", payload: {} }),
      }),
    );
  });

  it("should fall back to Redis pub/sub for unregistered channels", async () => {
    const transport = new HttpTransportManager({
      redisUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
    });

    await transport.publishMessage(
      "unknown.event",
      JSON.stringify({ requestId: "req-1", payload: {} }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockRedis.publish).toHaveBeenCalledWith(
      "unknown.event",
      JSON.stringify({ requestId: "req-1", payload: {} }),
    );
  });

  it("should sign requests with HMAC when secret is provided", async () => {
    const transport = new HttpTransportManager({
      redisUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
      secret: "my-secret",
      handlerRoutes: [
        { eventType: "user.created", url: "/api/events/user-created" },
      ],
    });

    const message = JSON.stringify({ requestId: "req-1", payload: {} });
    await transport.publishMessage("user.created", message);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-synkro-signature": expect.any(String),
        }),
      }),
    );
  });

  it("should support absolute URLs in handler routes", async () => {
    const transport = new HttpTransportManager({
      redisUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
      handlerRoutes: [
        { eventType: "user.created", url: "https://other-service.com/api/handle" },
      ],
    });

    await transport.publishMessage(
      "user.created",
      JSON.stringify({ requestId: "req-1", payload: {} }),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://other-service.com/api/handle",
      expect.any(Object),
    );
  });

  it("subscribeToChannel should be a no-op", () => {
    const transport = new HttpTransportManager({
      redisUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
    });

    // Should not throw
    transport.subscribeToChannel("test", vi.fn());
  });

  it("should delegate cache operations to Redis", async () => {
    const transport = new HttpTransportManager({
      redisUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
    });

    await transport.getCache("key1");
    expect(mockRedis.get).toHaveBeenCalledWith("key1");

    await transport.setCache("key2", "val2", 60);
    expect(mockRedis.set).toHaveBeenCalledWith("key2", "val2", "EX", 60);

    await transport.deleteCache("key3");
    expect(mockRedis.del).toHaveBeenCalledWith("key3");

    const locked = await transport.setCacheIfNotExists("key4", "1", 30);
    expect(mockRedis.set).toHaveBeenCalledWith("key4", "1", "EX", 30, "NX");
    expect(locked).toBe(true);

    await transport.incrementCache("key5", 120);
    expect(mockRedis.incr).toHaveBeenCalledWith("key5");
    expect(mockRedis.expire).toHaveBeenCalledWith("key5", 120);
  });

  it("should allow registering routes dynamically", async () => {
    const transport = new HttpTransportManager({
      redisUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
    });

    transport.registerRoute("order.placed", "/api/events/order-placed");

    await transport.publishMessage(
      "order.placed",
      JSON.stringify({ requestId: "req-1", payload: {} }),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://myapp.vercel.app/api/events/order-placed",
      expect.any(Object),
    );
  });
});
