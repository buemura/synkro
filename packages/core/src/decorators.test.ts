import { describe, it, expect, vi, beforeEach } from "vitest";
import { Synkro } from "./index.js";
import { OnEvent, OnWorkflowStep, ON_EVENT_META, ON_WORKFLOW_STEP_META } from "./decorators.js";
import { discoverEventHandlers, discoverWorkflowStepHandlers } from "./handler-discovery.js";
import type { HandlerCtx } from "./types.js";

const mockPublish = vi.fn();
const mockSubscribe = vi.fn().mockResolvedValue(1);
const mockOn = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue("OK");
const mockDel = vi.fn();
const mockQuit = vi.fn().mockResolvedValue("OK");

vi.mock("ioredis", () => {
  class MockRedis {
    publish = mockPublish;
    subscribe = mockSubscribe;
    on = mockOn;
    get = mockGet;
    set = mockSet;
    del = mockDel;
    quit = mockQuit;
  }
  return { Redis: MockRedis };
});

describe("Decorators", () => {
  describe("OnEvent", () => {
    it("should store metadata on the method", () => {
      class MyHandlers {
        @OnEvent("user:created")
        async handle(_ctx: HandlerCtx) {}
      }

      const proto = MyHandlers.prototype as Record<string, any>;
      const metadata = proto["handle"][ON_EVENT_META];
      expect(metadata).toEqual({ eventType: "user:created", retry: undefined });
    });

    it("should store metadata with retry config", () => {
      class MyHandlers {
        @OnEvent("user:created", { maxRetries: 3 })
        async handle(_ctx: HandlerCtx) {}
      }

      const proto = MyHandlers.prototype as Record<string, any>;
      const metadata = proto["handle"][ON_EVENT_META];
      expect(metadata).toEqual({
        eventType: "user:created",
        retry: { maxRetries: 3 },
      });
    });
  });

  describe("OnWorkflowStep", () => {
    it("should store metadata on the method", () => {
      class MyHandlers {
        @OnWorkflowStep("order-flow", "validate")
        async handle(_ctx: HandlerCtx) {}
      }

      const proto = MyHandlers.prototype as Record<string, any>;
      const metadata = proto["handle"][ON_WORKFLOW_STEP_META];
      expect(metadata).toEqual({
        workflowName: "order-flow",
        stepType: "validate",
      });
    });
  });
});

describe("Handler Discovery", () => {
  describe("discoverEventHandlers", () => {
    it("should discover decorated event handlers from an instance", () => {
      class MyHandlers {
        @OnEvent("user:created", { maxRetries: 2 })
        async handleUser(_ctx: HandlerCtx) {}

        @OnEvent("order:placed")
        async handleOrder(_ctx: HandlerCtx) {}

        async notDecorated() {}
      }

      const instance = new MyHandlers();
      const handlers = discoverEventHandlers(instance);

      expect(handlers).toHaveLength(2);
      const eventTypes = handlers.map((h) => h.eventType);
      expect(eventTypes).toContain("user:created");
      expect(eventTypes).toContain("order:placed");
    });

    it("should bind handlers to the instance", () => {
      class MyHandlers {
        value = "test";

        @OnEvent("test:event")
        async handle(ctx: HandlerCtx) {
          (ctx as any).result = this.value;
        }
      }

      const instance = new MyHandlers();
      const handlers = discoverEventHandlers(instance);
      const ctx = { requestId: "1", payload: {}, publish: vi.fn(), setPayload: vi.fn() } as unknown as HandlerCtx;

      handlers[0]!.handler(ctx);
      expect((ctx as any).result).toBe("test");
    });
  });

  describe("discoverWorkflowStepHandlers", () => {
    it("should discover decorated workflow step handlers", () => {
      class MyHandlers {
        @OnWorkflowStep("order-flow", "validate")
        async validate(_ctx: HandlerCtx) {}

        @OnWorkflowStep("order-flow", "charge")
        async charge(_ctx: HandlerCtx) {}
      }

      const instance = new MyHandlers();
      const handlers = discoverWorkflowStepHandlers(instance);

      expect(handlers).toHaveLength(2);
      expect(handlers.map((h) => h.stepType)).toContain("validate");
      expect(handlers.map((h) => h.stepType)).toContain("charge");
      expect(handlers[0]!.workflowName).toBe("order-flow");
    });
  });
});

describe("Synkro with decorators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register event handlers from decorated class instances", async () => {
    class MyHandlers {
      @OnEvent("user:created")
      async handle(_ctx: HandlerCtx) {}
    }

    await Synkro.start({
      connectionUrl: "redis://localhost:6379",
      handlers: [new MyHandlers()],
    });

    expect(mockSubscribe).toHaveBeenCalledWith("user:created");
  });

  it("should register workflow step handlers from decorated class instances", async () => {
    class MyHandlers {
      @OnWorkflowStep("order-flow", "validate")
      async validate(_ctx: HandlerCtx) {}
    }

    await Synkro.start({
      connectionUrl: "redis://localhost:6379",
      workflows: [
        {
          name: "order-flow",
          steps: [{ type: "validate" }],
        },
      ],
      handlers: [new MyHandlers()],
    });

    expect(mockSubscribe).toHaveBeenCalledWith("workflow:order-flow:validate");
  });

  it("should support mixed inline and decorator handlers", async () => {
    const inlineHandler = vi.fn();

    class MyHandlers {
      @OnWorkflowStep("order-flow", "validate")
      async validate(_ctx: HandlerCtx) {}
    }

    await Synkro.start({
      connectionUrl: "redis://localhost:6379",
      workflows: [
        {
          name: "order-flow",
          steps: [
            { type: "validate" },
            { type: "charge", handler: inlineHandler },
          ],
        },
      ],
      handlers: [new MyHandlers()],
    });

    expect(mockSubscribe).toHaveBeenCalledWith("workflow:order-flow:validate");
    expect(mockSubscribe).toHaveBeenCalledWith("workflow:order-flow:charge");
  });

  it("should support multiple handler classes", async () => {
    class EventHandlers {
      @OnEvent("user:created")
      async handle(_ctx: HandlerCtx) {}
    }

    class WorkflowHandlers {
      @OnWorkflowStep("order-flow", "validate")
      async validate(_ctx: HandlerCtx) {}
    }

    await Synkro.start({
      connectionUrl: "redis://localhost:6379",
      workflows: [
        {
          name: "order-flow",
          steps: [{ type: "validate" }],
        },
      ],
      handlers: [new EventHandlers(), new WorkflowHandlers()],
    });

    expect(mockSubscribe).toHaveBeenCalledWith("user:created");
    expect(mockSubscribe).toHaveBeenCalledWith("workflow:order-flow:validate");
  });

  it("should throw when a workflow step has no handler", async () => {
    await expect(
      Synkro.start({
        connectionUrl: "redis://localhost:6379",
        workflows: [
          {
            name: "order-flow",
            steps: [{ type: "validate" }],
          },
        ],
      }),
    ).rejects.toThrow(
      'Workflow "order-flow" step "validate" has no handler. Provide an inline handler or use the @OnWorkflowStep decorator.',
    );
  });

  it("should register handlers via register() after start", async () => {
    class MyHandlers {
      @OnEvent("late:event")
      async handle(_ctx: HandlerCtx) {}
    }

    const instance = await Synkro.start({
      connectionUrl: "redis://localhost:6379",
    });

    instance.register(new MyHandlers());

    expect(mockSubscribe).toHaveBeenCalledWith("late:event");
  });
});
