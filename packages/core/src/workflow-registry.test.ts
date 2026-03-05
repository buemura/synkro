import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
import { WorkflowRegistry } from "./workflow-registry.js";
import type { HandlerRegistry } from "./handler-registry.js";
import type { RedisManager } from "./redis.js";
import type { SynkroWorkflow } from "./types.js";

function createMockRedis(): RedisManager {
  return {
    publishMessage: vi.fn(),
    subscribeToChannel: vi.fn(),
    getCache: vi.fn(),
    setCache: vi.fn().mockResolvedValue(undefined),
    deleteCache: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as RedisManager;
}

function createMockHandlerRegistry(): HandlerRegistry {
  return {
    register: vi.fn(),
  } as unknown as HandlerRegistry;
}

function createTestWorkflow(): SynkroWorkflow {
  return {
    name: "order-processing",
    steps: [
      { type: "validate", handler: vi.fn() },
      { type: "charge", handler: vi.fn() },
      { type: "ship", handler: vi.fn() },
    ],
  };
}

describe("WorkflowRegistry", () => {
  let registry: WorkflowRegistry;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockHandlerRegistry: ReturnType<typeof createMockHandlerRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = createMockRedis();
    mockHandlerRegistry = createMockHandlerRegistry();
    registry = new WorkflowRegistry(mockRedis, mockHandlerRegistry);
  });

  describe("registerWorkflows", () => {
    it("should register each step handler via HandlerRegistry", () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      expect(mockHandlerRegistry.register).toHaveBeenCalledTimes(3);
      expect(mockHandlerRegistry.register).toHaveBeenCalledWith(
        "workflow:order-processing:validate",
        workflow.steps[0]!.handler,
        undefined,
      );
      expect(mockHandlerRegistry.register).toHaveBeenCalledWith(
        "workflow:order-processing:charge",
        workflow.steps[1]!.handler,
        undefined,
      );
      expect(mockHandlerRegistry.register).toHaveBeenCalledWith(
        "workflow:order-processing:ship",
        workflow.steps[2]!.handler,
        undefined,
      );
    });

    it("should subscribe to completion events for each step", () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      expect(mockRedis.subscribeToChannel).toHaveBeenCalledWith(
        "event:workflow:order-processing:validate:completed",
        expect.any(Function),
      );
      expect(mockRedis.subscribeToChannel).toHaveBeenCalledWith(
        "event:workflow:order-processing:charge:completed",
        expect.any(Function),
      );
      expect(mockRedis.subscribeToChannel).toHaveBeenCalledWith(
        "event:workflow:order-processing:ship:completed",
        expect.any(Function),
      );
    });
  });

  describe("hasWorkflow", () => {
    it("should return true for registered workflows", () => {
      registry.registerWorkflows([createTestWorkflow()]);
      expect(registry.hasWorkflow("order-processing")).toBe(true);
    });

    it("should return false for unregistered workflows", () => {
      expect(registry.hasWorkflow("unknown")).toBe(false);
    });
  });

  describe("startWorkflow", () => {
    it("should save initial state and publish the first step", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      await registry.startWorkflow("order-processing", "req-1", {
        orderId: 42,
      });

      expect(mockRedis.setCache).toHaveBeenCalledWith(
        "workflow:state:req-1:order-processing",
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 0,
          status: "running",
        }),
        86400,
      );

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:order-processing:validate",
        JSON.stringify({ requestId: "req-1", payload: { orderId: 42 } }),
      );
    });

    it("should throw if workflow does not exist", async () => {
      await expect(
        registry.startWorkflow("nonexistent", "req-1", null),
      ).rejects.toThrow('Workflow "nonexistent" not found');
    });
  });

  describe("step completion handling", () => {
    it("should advance to the next step on completion", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      // Mock getCache to return valid state for step 0
      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 0,
          status: "running",
        }),
      );

      // Find the completion callback for the first step
      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls;
      const validateCompletionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:validate:completed",
      );
      const completionCallback = validateCompletionCall![1] as (
        message: string,
      ) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: { orderId: 42 } }),
      );
      await flushPromises();

      // Should save updated state
      expect(mockRedis.setCache).toHaveBeenCalledWith(
        "workflow:state:req-1:order-processing",
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 1,
          status: "running",
        }),
        86400,
      );

      // Should publish to the next step channel
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:order-processing:charge",
        JSON.stringify({ requestId: "req-1", payload: { orderId: 42 } }),
      );
    });

    it("should mark workflow as completed on last step", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 2,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls;
      const shipCompletionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:ship:completed",
      );
      const completionCallback = shipCompletionCall![1] as (
        message: string,
      ) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: null }),
      );
      await flushPromises();

      expect(mockRedis.setCache).toHaveBeenCalledWith(
        "workflow:state:req-1:order-processing",
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 2,
          status: "completed",
        }),
        86400,
      );
    });

    it("should skip if state is not found", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      vi.mocked(mockRedis.getCache).mockResolvedValue(null);

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls;
      const validateCompletionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:validate:completed",
      );
      const completionCallback = validateCompletionCall![1] as (
        message: string,
      ) => void;

      await completionCallback(
        JSON.stringify({ requestId: "req-unknown", payload: null }),
      );

      // Should not publish any further messages
      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });

    it("should skip if step index does not match current step", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      // State says we're on step 1, but completion fires for step 0
      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 1,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock
        .calls;
      const validateCompletionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:validate:completed",
      );
      const completionCallback = validateCompletionCall![1] as (
        message: string,
      ) => void;

      await completionCallback(
        JSON.stringify({ requestId: "req-1", payload: null }),
      );

      // Should not advance or publish
      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });
  });

  describe("conditional routing", () => {
    function createConditionalWorkflow(): SynkroWorkflow {
      return {
        name: "doc-processing",
        steps: [
          {
            type: "RunOCR",
            handler: vi.fn(),
            onSuccess: "ProcessingSucceeded",
            onFailure: "ProcessingFailed",
          },
          {
            type: "ProcessingSucceeded",
            handler: vi.fn(),
          },
          {
            type: "ProcessingFailed",
            handler: vi.fn(),
          },
        ],
      };
    }

    it("should subscribe to both completed and failed channels for each step", () => {
      const workflow = createConditionalWorkflow();
      registry.registerWorkflows([workflow]);

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const channels = subscribeCalls.map((call) => call[0]);

      expect(channels).toContain("event:workflow:doc-processing:RunOCR:completed");
      expect(channels).toContain("event:workflow:doc-processing:RunOCR:failed");
      expect(channels).toContain("event:workflow:doc-processing:ProcessingSucceeded:completed");
      expect(channels).toContain("event:workflow:doc-processing:ProcessingSucceeded:failed");
    });

    it("should route to onSuccess step when handler succeeds", async () => {
      const workflow = createConditionalWorkflow();
      registry.registerWorkflows([workflow]);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "doc-processing",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:doc-processing:RunOCR:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: { file: "doc.pdf" } }),
      );
      await flushPromises();

      // Should route to ProcessingSucceeded (index 1), not sequentially
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:doc-processing:ProcessingSucceeded",
        JSON.stringify({ requestId: "req-1", payload: { file: "doc.pdf" } }),
      );

      // Should save state with step 1
      expect(mockRedis.setCache).toHaveBeenCalledWith(
        "workflow:state:req-1:doc-processing",
        JSON.stringify({
          workflowName: "doc-processing",
          currentStep: 1,
          status: "running",
        }),
        86400,
      );
    });

    it("should route to onFailure step when handler fails", async () => {
      const workflow = createConditionalWorkflow();
      registry.registerWorkflows([workflow]);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "doc-processing",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const failureCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:doc-processing:RunOCR:failed",
      );
      const failureCallback = failureCall![1] as (message: string) => void;

      failureCallback(
        JSON.stringify({ requestId: "req-1", payload: { file: "doc.pdf" } }),
      );
      await flushPromises();

      // Should route to ProcessingFailed (index 2)
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:doc-processing:ProcessingFailed",
        JSON.stringify({ requestId: "req-1", payload: { file: "doc.pdf" } }),
      );

      expect(mockRedis.setCache).toHaveBeenCalledWith(
        "workflow:state:req-1:doc-processing",
        JSON.stringify({
          workflowName: "doc-processing",
          currentStep: 2,
          status: "running",
        }),
        86400,
      );
    });

    it("should mark workflow as failed when handler fails without onFailure", async () => {
      const workflow: SynkroWorkflow = {
        name: "simple-workflow",
        steps: [
          { type: "step1", handler: vi.fn() },
          { type: "step2", handler: vi.fn() },
        ],
      };
      registry.registerWorkflows([workflow]);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "simple-workflow",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const failureCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:simple-workflow:step1:failed",
      );
      const failureCallback = failureCall![1] as (message: string) => void;

      failureCallback(
        JSON.stringify({ requestId: "req-1", payload: null }),
      );
      await flushPromises();

      // Should mark as failed, not advance
      expect(mockRedis.setCache).toHaveBeenCalledWith(
        "workflow:state:req-1:simple-workflow",
        JSON.stringify({
          workflowName: "simple-workflow",
          currentStep: 0,
          status: "failed",
        }),
        86400,
      );

      // Should not publish to any step
      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });

    it("should mark workflow as completed when a branch target step completes without onSuccess", async () => {
      const workflow = createConditionalWorkflow();
      registry.registerWorkflows([workflow]);

      // ProcessingSucceeded is at index 1 and is a branch target
      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "doc-processing",
          currentStep: 1,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:doc-processing:ProcessingSucceeded:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: { file: "doc.pdf" } }),
      );
      await flushPromises();

      // Should mark as completed, NOT advance to ProcessingFailed
      expect(mockRedis.setCache).toHaveBeenCalledWith(
        "workflow:state:req-1:doc-processing",
        JSON.stringify({
          workflowName: "doc-processing",
          currentStep: 1,
          status: "completed",
        }),
        86400,
      );

      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });

    it("should skip sibling branch targets and advance to the next regular step", async () => {
      const workflow: SynkroWorkflow = {
        name: "order-flow",
        steps: [
          {
            type: "Payment",
            handler: vi.fn(),
            onSuccess: "PaymentCompleted",
            onFailure: "PaymentFailed",
          },
          { type: "PaymentCompleted", handler: vi.fn() },
          { type: "PaymentFailed", handler: vi.fn() },
          { type: "Notify", handler: vi.fn() },
        ],
      };
      registry.registerWorkflows([workflow]);

      // PaymentCompleted (index 1) just completed
      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "order-flow",
          currentStep: 1,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-flow:PaymentCompleted:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: {} }),
      );
      await flushPromises();

      // Should skip PaymentFailed (index 2, branch target) and go to Notify (index 3)
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:order-flow:Notify",
        JSON.stringify({ requestId: "req-1", payload: {} }),
      );

      expect(mockRedis.setCache).toHaveBeenCalledWith(
        "workflow:state:req-1:order-flow",
        JSON.stringify({
          workflowName: "order-flow",
          currentStep: 3,
          status: "running",
        }),
        86400,
      );
    });

    it("should still advance sequentially when no onSuccess is defined", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:validate:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: { orderId: 42 } }),
      );
      await flushPromises();

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:order-processing:charge",
        JSON.stringify({ requestId: "req-1", payload: { orderId: 42 } }),
      );
    });
  });

  describe("workflow chaining", () => {
    it("should trigger onSuccess workflow when workflow completes", async () => {
      const workflows: SynkroWorkflow[] = [
        {
          name: "process-order",
          steps: [{ type: "validate", handler: vi.fn() }],
          onSuccess: "start-shipment",
        },
        {
          name: "start-shipment",
          steps: [{ type: "ship", handler: vi.fn() }],
        },
      ];
      registry.registerWorkflows(workflows);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "process-order",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:process-order:validate:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: { orderId: 1 } }),
      );
      await flushPromises();

      // Should start the chained workflow
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:start-shipment:ship",
        JSON.stringify({ requestId: "req-1", payload: { orderId: 1 } }),
      );
    });

    it("should trigger onFailure workflow when workflow fails", async () => {
      const workflows: SynkroWorkflow[] = [
        {
          name: "process-order",
          steps: [{ type: "validate", handler: vi.fn() }],
          onFailure: "handle-error",
        },
        {
          name: "handle-error",
          steps: [{ type: "notify", handler: vi.fn() }],
        },
      ];
      registry.registerWorkflows(workflows);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "process-order",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const failureCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:process-order:validate:failed",
      );
      const failureCallback = failureCall![1] as (message: string) => void;

      failureCallback(
        JSON.stringify({ requestId: "req-1", payload: { orderId: 1 } }),
      );
      await flushPromises();

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:handle-error:notify",
        JSON.stringify({ requestId: "req-1", payload: { orderId: 1 } }),
      );
    });

    it("should trigger onComplete workflow regardless of outcome", async () => {
      const workflows: SynkroWorkflow[] = [
        {
          name: "process-order",
          steps: [{ type: "validate", handler: vi.fn() }],
          onComplete: "cleanup",
        },
        {
          name: "cleanup",
          steps: [{ type: "clean", handler: vi.fn() }],
        },
      ];
      registry.registerWorkflows(workflows);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "process-order",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:process-order:validate:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: null }),
      );
      await flushPromises();

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:cleanup:clean",
        JSON.stringify({ requestId: "req-1", payload: null }),
      );
    });

    it("should trigger both onSuccess and onComplete on success", async () => {
      const workflows: SynkroWorkflow[] = [
        {
          name: "process-order",
          steps: [{ type: "validate", handler: vi.fn() }],
          onSuccess: "start-shipment",
          onComplete: "cleanup",
        },
        {
          name: "start-shipment",
          steps: [{ type: "ship", handler: vi.fn() }],
        },
        {
          name: "cleanup",
          steps: [{ type: "clean", handler: vi.fn() }],
        },
      ];
      registry.registerWorkflows(workflows);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "process-order",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:process-order:validate:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: null }),
      );
      await flushPromises();

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:start-shipment:ship",
        JSON.stringify({ requestId: "req-1", payload: null }),
      );
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:cleanup:clean",
        JSON.stringify({ requestId: "req-1", payload: null }),
      );
    });

    it("should not trigger onSuccess when workflow fails", async () => {
      const workflows: SynkroWorkflow[] = [
        {
          name: "process-order",
          steps: [{ type: "validate", handler: vi.fn() }],
          onSuccess: "start-shipment",
          onFailure: "handle-error",
        },
        {
          name: "start-shipment",
          steps: [{ type: "ship", handler: vi.fn() }],
        },
        {
          name: "handle-error",
          steps: [{ type: "notify", handler: vi.fn() }],
        },
      ];
      registry.registerWorkflows(workflows);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "process-order",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const failureCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:process-order:validate:failed",
      );
      const failureCallback = failureCall![1] as (message: string) => void;

      failureCallback(
        JSON.stringify({ requestId: "req-1", payload: null }),
      );
      await flushPromises();

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:handle-error:notify",
        JSON.stringify({ requestId: "req-1", payload: null }),
      );
      expect(mockRedis.publishMessage).not.toHaveBeenCalledWith(
        "workflow:start-shipment:ship",
        expect.any(String),
      );
    });
  });
});
