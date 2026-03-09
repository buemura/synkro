import { describe, expect, it, vi } from "vitest";

import { createSynkroServerless } from "./synkro-serverless.js";
import { HttpTransportManager } from "./transport/http-transport.js";
import { WorkflowAdvancer } from "./transport/workflow-advancer.js";

vi.mock("@synkro/core", () => {
  const mockInstance = {
    publish: vi.fn().mockResolvedValue("req-123"),
    on: vi.fn(),
    off: vi.fn(),
    getWorkflowState: vi.fn().mockResolvedValue(null),
    cancelWorkflow: vi.fn().mockResolvedValue(false),
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

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    quit: vi.fn().mockResolvedValue("OK"),
  })),
}));

describe("createSynkroServerless", () => {
  it("should return client, transport, and advancer", () => {
    const result = createSynkroServerless({
      connectionUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
    });

    expect(result.client).toBeDefined();
    expect(result.transport).toBeInstanceOf(HttpTransportManager);
    expect(result.advancer).toBeInstanceOf(WorkflowAdvancer);
  });

  it("should configure transport with handler routes", () => {
    const result = createSynkroServerless({
      connectionUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
      handlerRoutes: [
        { eventType: "user.created", url: "/api/events/user-created" },
      ],
    });

    expect(result.transport).toBeInstanceOf(HttpTransportManager);
  });

  it("should configure advancer with workflows", () => {
    const result = createSynkroServerless({
      connectionUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
      workflows: [
        {
          name: "checkout",
          steps: [
            { type: "validate", handler: vi.fn() },
            { type: "charge", handler: vi.fn() },
          ],
        },
      ],
    });

    expect(result.advancer).toBeInstanceOf(WorkflowAdvancer);
  });

  it("should expose a functional client", async () => {
    const result = createSynkroServerless({
      connectionUrl: "redis://localhost:6379",
      baseUrl: "https://myapp.vercel.app",
    });

    // Client methods should be callable
    expect(result.client.publish).toBeTypeOf("function");
    expect(result.client.on).toBeTypeOf("function");
    expect(result.client.off).toBeTypeOf("function");
    expect(result.client.getWorkflowState).toBeTypeOf("function");
    expect(result.client.cancelWorkflow).toBeTypeOf("function");
    expect(result.client.introspect).toBeTypeOf("function");
    expect(result.client.getEventMetrics).toBeTypeOf("function");
    expect(result.client.stop).toBeTypeOf("function");
  });
});
