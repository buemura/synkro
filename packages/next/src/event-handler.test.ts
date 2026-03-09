import { describe, expect, it, vi } from "vitest";

import { createEventHandler } from "./event-handler.js";
import type { SynkroClient } from "./synkro.js";
import type { TransportManager } from "@synkro/core";

vi.mock("@synkro/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@synkro/core")>();
  return {
    ...actual,
    executeHandler: vi.fn().mockResolvedValue({ success: true }),
  };
});

function createMockTransport(): TransportManager {
  return {
    publishMessage: vi.fn().mockResolvedValue(undefined),
    subscribeToChannel: vi.fn(),
    unsubscribeFromChannel: vi.fn(),
    setCacheIfNotExists: vi.fn().mockResolvedValue(true),
    getCache: vi.fn().mockResolvedValue(null),
    setCache: vi.fn().mockResolvedValue(undefined),
    deleteCache: vi.fn().mockResolvedValue(undefined),
    incrementCache: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockClient(): SynkroClient {
  const mockInstance = {
    publish: vi.fn().mockResolvedValue("req-1"),
  };
  return {
    publish: vi.fn().mockResolvedValue("req-1"),
    on: vi.fn(),
    off: vi.fn(),
    getWorkflowState: vi.fn().mockResolvedValue(null),
    cancelWorkflow: vi.fn().mockResolvedValue(false),
    introspect: vi.fn().mockResolvedValue({ events: [], workflows: [] }),
    getEventMetrics: vi.fn().mockResolvedValue({
      type: "test",
      received: 0,
      completed: 0,
      failed: 0,
    }),
    getInstance: vi.fn().mockResolvedValue(mockInstance),
    stop: vi.fn(),
  };
}

describe("createEventHandler", () => {
  it("should reject non-POST requests with 405", async () => {
    const handler = createEventHandler(createMockClient(), {
      eventType: "user.created",
      handler: vi.fn(),
      transport: createMockTransport(),
    });

    const response = await handler(
      new Request("http://localhost/api/events/user-created", { method: "GET" }),
    );

    expect(response.status).toBe(405);
  });

  it("should reject missing requestId with 400", async () => {
    const handler = createEventHandler(createMockClient(), {
      eventType: "user.created",
      handler: vi.fn(),
      transport: createMockTransport(),
    });

    const response = await handler(
      new Request("http://localhost/api/events/user-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: { email: "test@test.com" } }),
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Missing or invalid requestId");
  });

  it("should reject invalid JSON with 400", async () => {
    const handler = createEventHandler(createMockClient(), {
      eventType: "user.created",
      handler: vi.fn(),
      transport: createMockTransport(),
    });

    const response = await handler(
      new Request("http://localhost/api/events/user-created", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("should execute handler and return success", async () => {
    const { executeHandler } = await import("@synkro/core");
    (executeHandler as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const handler = createEventHandler(createMockClient(), {
      eventType: "user.created",
      handler: vi.fn(),
      transport: createMockTransport(),
    });

    const response = await handler(
      new Request("http://localhost/api/events/user-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-1", payload: { email: "test@test.com" } }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true, requestId: "req-1" });
  });

  it("should return 500 on handler failure", async () => {
    const { executeHandler } = await import("@synkro/core");
    (executeHandler as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: { message: "Something went wrong", name: "Error" },
    });

    const handler = createEventHandler(createMockClient(), {
      eventType: "user.created",
      handler: vi.fn(),
      transport: createMockTransport(),
    });

    const response = await handler(
      new Request("http://localhost/api/events/user-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-1", payload: {} }),
      }),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error.message).toBe("Something went wrong");
  });

  it("should reject missing signature when secret is configured", async () => {
    const handler = createEventHandler(createMockClient(), {
      eventType: "user.created",
      handler: vi.fn(),
      transport: createMockTransport(),
      secret: "my-secret",
    });

    const response = await handler(
      new Request("http://localhost/api/events/user-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-1", payload: {} }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("should reject invalid signature when secret is configured", async () => {
    const handler = createEventHandler(createMockClient(), {
      eventType: "user.created",
      handler: vi.fn(),
      transport: createMockTransport(),
      secret: "my-secret",
    });

    const response = await handler(
      new Request("http://localhost/api/events/user-created", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-synkro-signature": "invalid-sig",
        },
        body: JSON.stringify({ requestId: "req-1", payload: {} }),
      }),
    );

    expect(response.status).toBe(401);
  });
});
