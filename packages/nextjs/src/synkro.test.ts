import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSynkro } from "./synkro.js";

vi.mock("@synkro/core", () => {
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
    Synkro: {
      start: vi.fn().mockResolvedValue(mockInstance),
    },
  };
});

describe("createSynkro", () => {
  // Reset globalThis between tests
  const GLOBAL_KEY = "__synkro_instance__";

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    vi.clearAllMocks();
  });

  it("should create a synkro client", () => {
    const client = createSynkro({ transport: "in-memory" });
    expect(client).toBeDefined();
    expect(client.publish).toBeTypeOf("function");
    expect(client.on).toBeTypeOf("function");
    expect(client.introspect).toBeTypeOf("function");
    expect(client.getEventMetrics).toBeTypeOf("function");
    expect(client.getInstance).toBeTypeOf("function");
    expect(client.stop).toBeTypeOf("function");
  });

  it("should lazily initialize on publish", async () => {
    const { Synkro } = await import("@synkro/core");
    const client = createSynkro({ transport: "in-memory" });

    expect(Synkro.start).not.toHaveBeenCalled();

    const requestId = await client.publish("test-event", { foo: "bar" });

    expect(Synkro.start).toHaveBeenCalledWith({ transport: "in-memory" });
    expect(requestId).toBe("req-123");
  });

  it("should reuse the same instance across calls", async () => {
    const { Synkro } = await import("@synkro/core");
    const client = createSynkro({ transport: "in-memory" });

    await client.publish("event-1");
    await client.publish("event-2");

    expect(Synkro.start).toHaveBeenCalledTimes(1);
  });

  it("should clean up on stop", async () => {
    const client = createSynkro({ transport: "in-memory" });
    await client.publish("test");

    expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toBeDefined();

    await client.stop();

    expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toBeUndefined();
  });
});
