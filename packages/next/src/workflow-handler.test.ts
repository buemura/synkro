import { describe, expect, it, vi } from "vitest";

import { createWorkflowStepHandler } from "./workflow-handler.js";
import type { SynkroClient } from "./synkro.js";
import type { TransportManager } from "@synkro/core";
import type { WorkflowAdvancer } from "./transport/workflow-advancer.js";

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

function createMockAdvancer(): WorkflowAdvancer {
  return {
    advanceAfterStep: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkflowAdvancer;
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

describe("createWorkflowStepHandler", () => {
  it("should reject non-POST requests with 405", async () => {
    const handler = createWorkflowStepHandler(createMockClient(), {
      workflowName: "checkout",
      stepType: "validate",
      handler: vi.fn(),
      transport: createMockTransport(),
      advancer: createMockAdvancer(),
    });

    const response = await handler(
      new Request("http://localhost/api/workflows/checkout/validate", { method: "GET" }),
    );

    expect(response.status).toBe(405);
  });

  it("should execute handler and advance workflow on success", async () => {
    const { executeHandler } = await import("@synkro/core");
    (executeHandler as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const advancer = createMockAdvancer();
    const handler = createWorkflowStepHandler(createMockClient(), {
      workflowName: "checkout",
      stepType: "validate",
      handler: vi.fn(),
      transport: createMockTransport(),
      advancer,
    });

    const response = await handler(
      new Request("http://localhost/api/workflows/checkout/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-1", payload: { orderId: "ord-1" } }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true, requestId: "req-1" });

    // Verify advancer was called with success=true
    expect(advancer.advanceAfterStep).toHaveBeenCalledWith(
      "checkout",
      "validate",
      "req-1",
      { orderId: "ord-1" },
      true,
    );
  });

  it("should advance workflow with failure on handler error", async () => {
    const { executeHandler } = await import("@synkro/core");
    (executeHandler as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: { message: "Validation failed" },
    });

    const advancer = createMockAdvancer();
    const handler = createWorkflowStepHandler(createMockClient(), {
      workflowName: "checkout",
      stepType: "validate",
      handler: vi.fn(),
      transport: createMockTransport(),
      advancer,
    });

    const response = await handler(
      new Request("http://localhost/api/workflows/checkout/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-1", payload: {} }),
      }),
    );

    expect(response.status).toBe(500);

    // Verify advancer was called with success=false
    expect(advancer.advanceAfterStep).toHaveBeenCalledWith(
      "checkout",
      "validate",
      "req-1",
      {},
      false,
    );
  });

  it("should pass correct eventType to executeHandler", async () => {
    const { executeHandler } = await import("@synkro/core");
    (executeHandler as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const handler = createWorkflowStepHandler(createMockClient(), {
      workflowName: "checkout",
      stepType: "validate",
      handler: vi.fn(),
      transport: createMockTransport(),
      advancer: createMockAdvancer(),
    });

    await handler(
      new Request("http://localhost/api/workflows/checkout/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-1", payload: {} }),
      }),
    );

    expect(executeHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "workflow:checkout:validate",
        trackMetrics: false,
      }),
    );
  });
});
