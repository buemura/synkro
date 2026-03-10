import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
import { WorkflowRegistry } from "./workflow-registry.js";
import type { HandlerRegistry } from "../handlers/handler-registry.js";
import type { RedisManager } from "../transport/redis.js";
import type { SynkroWorkflow } from "../types.js";

function createMockRedis(): RedisManager {
  return {
    publishMessage: vi.fn().mockResolvedValue(undefined),
    subscribeToChannel: vi.fn(),
    getCache: vi.fn(),
    setCacheIfNotExists: vi.fn().mockResolvedValue(true),
    setCache: vi.fn().mockResolvedValue(undefined),
    deleteCache: vi.fn(),
    incrementCache: vi.fn().mockResolvedValue(1),
    pushToList: vi.fn().mockResolvedValue(undefined),
    getListRange: vi.fn().mockResolvedValue([]),
    deleteKey: vi.fn().mockResolvedValue(undefined),
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

  describe("workflow validation", () => {
    it("should reject a workflow with empty name", () => {
      expect(() =>
        registry.registerWorkflows([
          { name: "", steps: [{ type: "step1", handler: vi.fn() }] },
        ]),
      ).toThrow("Workflow name must not be empty");
    });

    it("should reject a workflow with no steps", () => {
      expect(() =>
        registry.registerWorkflows([{ name: "empty-workflow", steps: [] }]),
      ).toThrow('Workflow "empty-workflow" must have at least one step');
    });

    it("should reject a workflow with duplicate step types", () => {
      expect(() =>
        registry.registerWorkflows([
          {
            name: "dup-workflow",
            steps: [
              { type: "step1", handler: vi.fn() },
              { type: "step1", handler: vi.fn() },
            ],
          },
        ]),
      ).toThrow(
        'Workflow "dup-workflow" has duplicate step type "step1"',
      );
    });

    it("should auto-append implicit onSuccess target not in steps array", () => {
      registry.registerWorkflows([
        {
          name: "implicit-workflow",
          steps: [
            {
              type: "step1",
              handler: vi.fn(),
              onSuccess: "SuccessHandler",
            },
          ],
        },
      ]);

      const workflows = registry.getRegisteredWorkflows();
      const wf = workflows.find((w) => w.name === "implicit-workflow")!;
      expect(wf.steps).toHaveLength(2);
      expect(wf.steps[1]!.type).toBe("SuccessHandler");
    });

    it("should auto-append implicit onFailure target not in steps array", () => {
      registry.registerWorkflows([
        {
          name: "implicit-workflow",
          steps: [
            {
              type: "step1",
              handler: vi.fn(),
              onFailure: "FailureHandler",
            },
          ],
        },
      ]);

      const workflows = registry.getRegisteredWorkflows();
      const wf = workflows.find((w) => w.name === "implicit-workflow")!;
      expect(wf.steps).toHaveLength(2);
      expect(wf.steps[1]!.type).toBe("FailureHandler");
    });

    it("should not duplicate step when target already exists in steps array", () => {
      registry.registerWorkflows([
        {
          name: "explicit-workflow",
          steps: [
            {
              type: "step1",
              handler: vi.fn(),
              onFailure: "step2",
            },
            { type: "step2", handler: vi.fn() },
          ],
        },
      ]);

      const workflows = registry.getRegisteredWorkflows();
      const wf = workflows.find((w) => w.name === "explicit-workflow")!;
      expect(wf.steps).toHaveLength(2);
    });

    it("should add branch target only once when referenced by multiple steps", () => {
      registry.registerWorkflows([
        {
          name: "multi-ref-workflow",
          steps: [
            { type: "step1", handler: vi.fn(), onFailure: "ErrorHandler" },
            { type: "step2", handler: vi.fn(), onFailure: "ErrorHandler" },
          ],
        },
      ]);

      const workflows = registry.getRegisteredWorkflows();
      const wf = workflows.find((w) => w.name === "multi-ref-workflow")!;
      expect(wf.steps).toHaveLength(3);
      expect(wf.steps.filter((s) => s.type === "ErrorHandler")).toHaveLength(1);
    });

    it("should accept a valid workflow with onSuccess/onFailure targets", () => {
      expect(() =>
        registry.registerWorkflows([
          {
            name: "valid-workflow",
            steps: [
              {
                type: "step1",
                handler: vi.fn(),
                onSuccess: "step2",
                onFailure: "step3",
              },
              { type: "step2", handler: vi.fn() },
              { type: "step3", handler: vi.fn() },
            ],
          },
        ]),
      ).not.toThrow();
    });
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

    it("should skip completion when distributed lock cannot be acquired", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);
      vi.mocked(mockRedis.setCacheIfNotExists).mockResolvedValueOnce(false);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
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

    it("should subscribe to channels for implicit branch target steps", () => {
      registry.registerWorkflows([
        {
          name: "implicit-routing",
          steps: [
            {
              type: "RunTask",
              handler: vi.fn(),
              onSuccess: "TaskSucceeded",
              onFailure: "TaskFailed",
            },
          ],
        },
      ]);

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const channels = subscribeCalls.map((call) => call[0]);

      expect(channels).toContain("event:workflow:implicit-routing:TaskSucceeded:completed");
      expect(channels).toContain("event:workflow:implicit-routing:TaskSucceeded:failed");
      expect(channels).toContain("event:workflow:implicit-routing:TaskFailed:completed");
      expect(channels).toContain("event:workflow:implicit-routing:TaskFailed:failed");
    });

    it("should route to implicit onFailure step correctly", async () => {
      registry.registerWorkflows([
        {
          name: "implicit-fail-routing",
          steps: [
            {
              type: "Process",
              handler: vi.fn(),
              onFailure: "HandleError",
            },
            { type: "NextStep", handler: vi.fn() },
          ],
        },
      ]);

      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "implicit-fail-routing",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const failureCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:implicit-fail-routing:Process:failed",
      );
      const failureCallback = failureCall![1] as (message: string) => void;

      failureCallback(
        JSON.stringify({ requestId: "req-1", payload: { data: "test" } }),
      );
      await flushPromises();

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:implicit-fail-routing:HandleError",
        JSON.stringify({ requestId: "req-1", payload: { data: "test" } }),
      );
    });

    it("should skip implicit branch targets in sequential advancement", async () => {
      registry.registerWorkflows([
        {
          name: "implicit-skip",
          steps: [
            {
              type: "Step1",
              handler: vi.fn(),
              onFailure: "ErrorHandler",
            },
            { type: "Step2", handler: vi.fn() },
          ],
        },
      ]);

      // Step1 completes successfully — should skip ErrorHandler (implicit, appended at end) and go to Step2
      vi.mocked(mockRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "implicit-skip",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:implicit-skip:Step1:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-1", payload: {} }),
      );
      await flushPromises();

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "workflow:implicit-skip:Step2",
        JSON.stringify({ requestId: "req-1", payload: {} }),
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

    it("should trigger both onFailure and onComplete on failure", async () => {
      const workflows: SynkroWorkflow[] = [
        {
          name: "process-order",
          steps: [{ type: "validate", handler: vi.fn() }],
          onFailure: "handle-error",
          onComplete: "cleanup",
        },
        {
          name: "handle-error",
          steps: [{ type: "notify", handler: vi.fn() }],
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

  describe("concurrent completion handling", () => {
    it("should process only one completion when multiple arrive concurrently for the same step", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      // First state read returns step 0 (running); subsequent reads return step 1
      // so stale duplicate completions are ignored.
      let stateReadCount = 0;
      vi.mocked(mockRedis.getCache).mockImplementation(async (key: string) => {
        if (key.startsWith("synkro:dedupe:")) {
          return null;
        }

        stateReadCount += 1;
        if (stateReadCount === 1) {
          return JSON.stringify({
            workflowName: "order-processing",
            currentStep: 0,
            status: "running",
          });
        }

        return JSON.stringify({
          workflowName: "order-processing",
          currentStep: 1,
          status: "running",
        });
      });

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const validateCompletionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:validate:completed",
      );
      const completionCallback = validateCompletionCall![1] as (
        message: string,
      ) => void;

      const message = JSON.stringify({
        requestId: "req-race",
        payload: { orderId: 42 },
      });

      // Fire 3 concurrent completions for the same step
      completionCallback(message);
      completionCallback(message);
      completionCallback(message);
      await flushPromises();

      // The next step should be published exactly once
      const chargePublishes = vi
        .mocked(mockRedis.publishMessage)
        .mock.calls.filter(
          (call) => call[0] === "workflow:order-processing:charge",
        );
      expect(chargePublishes).toHaveLength(1);
    });

    it("should process only one failure when multiple arrive concurrently for the same step", async () => {
      const workflow: SynkroWorkflow = {
        name: "simple-workflow",
        steps: [
          { type: "step1", handler: vi.fn() },
          { type: "step2", handler: vi.fn() },
        ],
      };
      registry.registerWorkflows([workflow]);

      // First state read returns running; subsequent reads return failed so
      // duplicate failures are ignored.
      let stateReadCount = 0;
      vi.mocked(mockRedis.getCache).mockImplementation(async (key: string) => {
        if (key.startsWith("synkro:dedupe:")) {
          return null;
        }

        stateReadCount += 1;
        if (stateReadCount === 1) {
          return JSON.stringify({
            workflowName: "simple-workflow",
            currentStep: 0,
            status: "running",
          });
        }

        return JSON.stringify({
          workflowName: "simple-workflow",
          currentStep: 0,
          status: "failed",
        });
      });

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const failureCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:simple-workflow:step1:failed",
      );
      const failureCallback = failureCall![1] as (message: string) => void;

      const message = JSON.stringify({
        requestId: "req-race-fail",
        payload: null,
      });

      // Fire 3 concurrent failures for the same step
      failureCallback(message);
      failureCallback(message);
      failureCallback(message);
      await flushPromises();

      // State should be saved as failed exactly once
      const failedStateSaves = vi
        .mocked(mockRedis.setCache)
        .mock.calls.filter(
          (call) =>
            call[0] === "workflow:state:req-race-fail:simple-workflow" &&
            JSON.parse(call[1] as string).status === "failed",
        );
      expect(failedStateSaves).toHaveLength(1);
    });
  });

  describe("malformed message handling", () => {
    it("should drop malformed JSON on completion channel", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:validate:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback("not valid json");
      await flushPromises();

      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });

    it("should drop message with missing requestId on failure channel", async () => {
      const workflow = createTestWorkflow();
      registry.registerWorkflows([workflow]);

      const subscribeCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const failureCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:validate:failed",
      );
      const failureCallback = failureCall![1] as (message: string) => void;

      failureCallback(JSON.stringify({ payload: {} }));
      await flushPromises();

      expect(mockRedis.publishMessage).not.toHaveBeenCalled();
    });
  });

  describe("retention config", () => {
    it("should use custom stateTtl for workflow state", async () => {
      const customRedis = createMockRedis();
      const customHandlerRegistry = createMockHandlerRegistry();
      const customRegistry = new WorkflowRegistry(customRedis, customHandlerRegistry, { stateTtl: 600 });

      const workflow = createTestWorkflow();
      customRegistry.registerWorkflows([workflow]);

      await customRegistry.startWorkflow("order-processing", "req-ttl", { orderId: 1 });

      expect(customRedis.setCache).toHaveBeenCalledWith(
        "workflow:state:req-ttl:order-processing",
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 0,
          status: "running",
        }),
        600,
      );
    });

    it("should use custom lockTtl for distributed lock", async () => {
      const customRedis = createMockRedis();
      const customHandlerRegistry = createMockHandlerRegistry();
      const customRegistry = new WorkflowRegistry(customRedis, customHandlerRegistry, { lockTtl: 30 });

      const workflow = createTestWorkflow();
      customRegistry.registerWorkflows([workflow]);

      vi.mocked(customRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(customRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:validate:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-lock", payload: {} }),
      );
      await flushPromises();

      expect(customRedis.setCacheIfNotExists).toHaveBeenCalledWith(
        expect.stringContaining("synkro:lock:workflow:"),
        "1",
        30,
      );
    });

    it("should use custom dedupTtl for deduplication key", async () => {
      const customRedis = createMockRedis();
      const customHandlerRegistry = createMockHandlerRegistry();
      const customRegistry = new WorkflowRegistry(customRedis, customHandlerRegistry, { dedupTtl: 1800 });

      const workflow = createTestWorkflow();
      customRegistry.registerWorkflows([workflow]);

      vi.mocked(customRedis.getCache).mockResolvedValue(
        JSON.stringify({
          workflowName: "order-processing",
          currentStep: 0,
          status: "running",
        }),
      );

      const subscribeCalls = vi.mocked(customRedis.subscribeToChannel).mock.calls;
      const completionCall = subscribeCalls.find(
        (call) => call[0] === "event:workflow:order-processing:validate:completed",
      );
      const completionCallback = completionCall![1] as (message: string) => void;

      completionCallback(
        JSON.stringify({ requestId: "req-dedup", payload: {} }),
      );
      await flushPromises();

      expect(customRedis.setCache).toHaveBeenCalledWith(
        expect.stringContaining("synkro:dedupe:workflow:"),
        "1",
        1800,
      );
    });
  });

  describe("step timeout", () => {
    it("should publish failure event when step times out", async () => {
      vi.useFakeTimers();
      const workflow: SynkroWorkflow = {
        name: "timeout-workflow",
        steps: [{ type: "slow-step", handler: vi.fn(), timeoutMs: 5000 }],
      };

      registry.registerWorkflows([workflow]);
      await registry.startWorkflow("timeout-workflow", "req-timeout", { data: 1 });

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:workflow:timeout-workflow:slow-step:failed",
        expect.stringContaining("timed out"),
      );

      vi.useRealTimers();
    });

    it("should not trigger timeout when step completes before deadline", async () => {
      vi.useFakeTimers();
      const workflow: SynkroWorkflow = {
        name: "fast-workflow",
        steps: [{ type: "fast-step", handler: vi.fn(), timeoutMs: 5000 }],
      };

      registry.registerWorkflows([workflow]);

      // Mock state for step completion
      vi.mocked(mockRedis.getCache).mockResolvedValueOnce(
        JSON.stringify({ workflowName: "fast-workflow", currentStep: 0, status: "running" }),
      );

      await registry.startWorkflow("fast-workflow", "req-fast", { data: 1 });

      // Simulate step completion before timeout
      const completionCalls = vi.mocked(mockRedis.subscribeToChannel).mock.calls;
      const completionCallback = completionCalls.find(
        (c) => c[0] === "event:workflow:fast-workflow:fast-step:completed",
      )?.[1] as (message: string) => void;

      completionCallback(JSON.stringify({ requestId: "req-fast", payload: { data: 1 } }));
      await vi.advanceTimersByTimeAsync(0);

      // Clear publishMessage calls so far
      const callsBefore = vi.mocked(mockRedis.publishMessage).mock.calls.length;

      // Advance past timeout — should NOT publish failure
      await vi.advanceTimersByTimeAsync(5000);

      const callsAfter = vi.mocked(mockRedis.publishMessage).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);

      vi.useRealTimers();
    });

    it("should use workflow-level timeoutMs when step has no timeout", async () => {
      vi.useFakeTimers();
      const workflow: SynkroWorkflow = {
        name: "wf-timeout",
        steps: [{ type: "step1", handler: vi.fn() }],
        timeoutMs: 3000,
      };

      registry.registerWorkflows([workflow]);
      await registry.startWorkflow("wf-timeout", "req-wf-to", { data: 1 });

      await vi.advanceTimersByTimeAsync(3000);

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:workflow:wf-timeout:step1:failed",
        expect.stringContaining("timed out"),
      );

      vi.useRealTimers();
    });

    it("should prefer step-level timeoutMs over workflow-level", async () => {
      vi.useFakeTimers();
      const workflow: SynkroWorkflow = {
        name: "override-timeout",
        steps: [{ type: "step1", handler: vi.fn(), timeoutMs: 1000 }],
        timeoutMs: 5000,
      };

      registry.registerWorkflows([workflow]);
      await registry.startWorkflow("override-timeout", "req-override", {});

      // Step timeout is 1000ms, workflow is 5000ms — step should win
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        "event:workflow:override-timeout:step1:failed",
        expect.stringContaining("timed out"),
      );

      vi.useRealTimers();
    });

    it("should not set timer when no timeout is configured", async () => {
      vi.useFakeTimers();
      const workflow: SynkroWorkflow = {
        name: "no-timeout",
        steps: [{ type: "step1", handler: vi.fn() }],
      };

      registry.registerWorkflows([workflow]);
      await registry.startWorkflow("no-timeout", "req-no-to", {});

      // Record calls before advancing
      const callsBefore = vi.mocked(mockRedis.publishMessage).mock.calls.length;

      // Advance a long time — no timeout should fire
      await vi.advanceTimersByTimeAsync(60000);

      // Only the initial startWorkflow publish should have happened
      const callsAfter = vi.mocked(mockRedis.publishMessage).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);

      vi.useRealTimers();
    });

    it("should include timeoutMs in introspection", () => {
      const workflow: SynkroWorkflow = {
        name: "introspect-timeout",
        steps: [{ type: "step1", handler: vi.fn(), timeoutMs: 2000 }],
        timeoutMs: 5000,
      };

      registry.registerWorkflows([workflow]);
      const info = registry.getRegisteredWorkflows();

      expect(info[0]!.timeoutMs).toBe(5000);
      expect(info[0]!.steps[0]!.timeoutMs).toBe(2000);
    });
  });
});
