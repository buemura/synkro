import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOrko } from "./orko.js";

vi.mock("@orko/core", () => {
  const mockInstance = {
    publish: vi.fn().mockResolvedValue("req-123"),
    on: vi.fn(),
    introspect: vi.fn().mockReturnValue({ events: [], workflows: [] }),
    getEventMetrics: vi.fn().mockResolvedValue({
      type: "test",
      received: 0,
      completed: 0,
      failed: 0,
    }),
    stop: vi.fn().mockResolvedValue(undefined),
  };

  return {
    Orko: {
      start: vi.fn().mockResolvedValue(mockInstance),
    },
  };
});

describe("createOrko", () => {
  // Reset globalThis between tests
  const GLOBAL_KEY = "__orko_instance__";

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    vi.clearAllMocks();
  });

  it("should create a orko client", () => {
    const client = createOrko({ transport: "in-memory" });
    expect(client).toBeDefined();
    expect(client.publish).toBeTypeOf("function");
    expect(client.on).toBeTypeOf("function");
    expect(client.introspect).toBeTypeOf("function");
    expect(client.getEventMetrics).toBeTypeOf("function");
    expect(client.getInstance).toBeTypeOf("function");
    expect(client.stop).toBeTypeOf("function");
  });

  it("should lazily initialize on publish", async () => {
    const { Orko } = await import("@orko/core");
    const client = createOrko({ transport: "in-memory" });

    expect(Orko.start).not.toHaveBeenCalled();

    const requestId = await client.publish("test-event", { foo: "bar" });

    expect(Orko.start).toHaveBeenCalledWith({ transport: "in-memory" });
    expect(requestId).toBe("req-123");
  });

  it("should reuse the same instance across calls", async () => {
    const { Orko } = await import("@orko/core");
    const client = createOrko({ transport: "in-memory" });

    await client.publish("event-1");
    await client.publish("event-2");

    expect(Orko.start).toHaveBeenCalledTimes(1);
  });

  it("should clean up on stop", async () => {
    const client = createOrko({ transport: "in-memory" });
    await client.publish("test");

    expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toBeDefined();

    await client.stop();

    expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toBeUndefined();
  });
});
