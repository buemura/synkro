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
      );
      expect(mockHandlerRegistry.register).toHaveBeenCalledWith(
        "workflow:order-processing:charge",
        workflow.steps[1]!.handler,
      );
      expect(mockHandlerRegistry.register).toHaveBeenCalledWith(
        "workflow:order-processing:ship",
        workflow.steps[2]!.handler,
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
        "workflow:state:req-1",
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
        "workflow:state:req-1",
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
        "workflow:state:req-1",
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
});
