import { describe, expect, it, vi, beforeEach } from "vitest";

import { WorkflowAdvancer } from "./workflow-advancer.js";
import type { TransportManager, SynkroWorkflow } from "@synkro/core";

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

const checkoutWorkflow: SynkroWorkflow = {
  name: "checkout",
  steps: [
    { type: "validate", handler: vi.fn() },
    { type: "charge", handler: vi.fn() },
    { type: "fulfill", handler: vi.fn() },
  ],
};

const branchingWorkflow: SynkroWorkflow = {
  name: "deploy",
  steps: [
    { type: "build", handler: vi.fn(), onSuccess: "test", onFailure: "rollback" },
    { type: "test", handler: vi.fn() },
    { type: "rollback", handler: vi.fn() },
  ],
};

describe("WorkflowAdvancer", () => {
  let transport: TransportManager;

  beforeEach(() => {
    transport = createMockTransport();
    vi.clearAllMocks();
  });

  it("should advance to the next linear step on success", async () => {
    // Set up state: workflow is running at step 0
    (transport.getCache as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key.includes("workflow:state:")) {
        return JSON.stringify({ workflowName: "checkout", currentStep: 0, status: "running" });
      }
      return null; // dedup key not found
    });

    const advancer = new WorkflowAdvancer({
      transport,
      workflows: [checkoutWorkflow],
    });

    await advancer.advanceAfterStep("checkout", "validate", "req-1", { orderId: "o1" }, true);

    // Should update state to step 1
    expect(transport.setCache).toHaveBeenCalledWith(
      "workflow:state:req-1:checkout",
      JSON.stringify({ workflowName: "checkout", currentStep: 1, status: "running" }),
      expect.any(Number),
    );

    // Should publish to the next step channel
    expect(transport.publishMessage).toHaveBeenCalledWith(
      "workflow:checkout:charge",
      JSON.stringify({ requestId: "req-1", payload: { orderId: "o1" } }),
    );
  });

  it("should mark workflow as completed when last step succeeds", async () => {
    (transport.getCache as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key.includes("workflow:state:")) {
        return JSON.stringify({ workflowName: "checkout", currentStep: 2, status: "running" });
      }
      return null;
    });

    const advancer = new WorkflowAdvancer({
      transport,
      workflows: [checkoutWorkflow],
    });

    await advancer.advanceAfterStep("checkout", "fulfill", "req-1", {}, true);

    // Should save completed state
    expect(transport.setCache).toHaveBeenCalledWith(
      "workflow:state:req-1:checkout",
      JSON.stringify({ workflowName: "checkout", currentStep: 2, status: "completed" }),
      expect.any(Number),
    );
  });

  it("should mark workflow as failed when step fails with no onFailure", async () => {
    // Use checkout which has no onFailure branching
    (transport.getCache as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key.includes("workflow:state:")) {
        return JSON.stringify({ workflowName: "checkout", currentStep: 1, status: "running" });
      }
      return null;
    });

    const advancer = new WorkflowAdvancer({
      transport,
      workflows: [checkoutWorkflow],
    });

    await advancer.advanceAfterStep("checkout", "charge", "req-1", {}, false);

    expect(transport.setCache).toHaveBeenCalledWith(
      "workflow:state:req-1:checkout",
      JSON.stringify({ workflowName: "checkout", currentStep: 1, status: "failed" }),
      expect.any(Number),
    );
  });

  it("should route to onSuccess branch step", async () => {
    (transport.getCache as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key.includes("workflow:state:")) {
        return JSON.stringify({ workflowName: "deploy", currentStep: 0, status: "running" });
      }
      return null;
    });

    const advancer = new WorkflowAdvancer({
      transport,
      workflows: [branchingWorkflow],
    });

    await advancer.advanceAfterStep("deploy", "build", "req-1", {}, true);

    // Should route to "test" step (index 1)
    expect(transport.publishMessage).toHaveBeenCalledWith(
      "workflow:deploy:test",
      JSON.stringify({ requestId: "req-1", payload: {} }),
    );
  });

  it("should route to onFailure branch step", async () => {
    (transport.getCache as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key.includes("workflow:state:")) {
        return JSON.stringify({ workflowName: "deploy", currentStep: 0, status: "running" });
      }
      return null;
    });

    const advancer = new WorkflowAdvancer({
      transport,
      workflows: [branchingWorkflow],
    });

    await advancer.advanceAfterStep("deploy", "build", "req-1", {}, false);

    // Should route to "rollback" step (index 2)
    expect(transport.publishMessage).toHaveBeenCalledWith(
      "workflow:deploy:rollback",
      JSON.stringify({ requestId: "req-1", payload: {} }),
    );
  });

  it("should skip advancement if already processed (dedup)", async () => {
    // Dedup key returns "1" meaning already processed
    (transport.getCache as ReturnType<typeof vi.fn>).mockResolvedValue("1");

    const advancer = new WorkflowAdvancer({
      transport,
      workflows: [checkoutWorkflow],
    });

    await advancer.advanceAfterStep("checkout", "validate", "req-1", {}, true);

    // Should not publish to next step
    expect(transport.publishMessage).not.toHaveBeenCalled();
  });

  it("should skip advancement if lock cannot be acquired", async () => {
    (transport.getCache as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (transport.setCacheIfNotExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const advancer = new WorkflowAdvancer({
      transport,
      workflows: [checkoutWorkflow],
    });

    await advancer.advanceAfterStep("checkout", "validate", "req-1", {}, true);

    expect(transport.publishMessage).not.toHaveBeenCalled();
  });

  it("should skip if workflow state is not running", async () => {
    (transport.getCache as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key.includes("workflow:state:")) {
        return JSON.stringify({ workflowName: "checkout", currentStep: 0, status: "cancelled" });
      }
      return null;
    });

    const advancer = new WorkflowAdvancer({
      transport,
      workflows: [checkoutWorkflow],
    });

    await advancer.advanceAfterStep("checkout", "validate", "req-1", {}, true);

    expect(transport.publishMessage).not.toHaveBeenCalled();
  });
});
