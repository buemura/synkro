import { describe, it, expect, vi, afterEach } from "vitest";
import { Synkro, OnEvent, OnWorkflowStep } from "../index.js";
import type { HandlerCtx, MiddlewareFunction, SynkroEvent, SynkroWorkflow } from "../index.js";

/**
 * Flush microtask and macrotask queues so the in-memory transport
 * can deliver messages and the handler/workflow registries can
 * process them across multiple async hops.
 */
async function settle(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

function startInMemory(opts: {
  events?: SynkroEvent[];
  workflows?: SynkroWorkflow[];
  handlers?: object[];
}) {
  return Synkro.start({ transport: "in-memory", ...opts });
}

describe("Integration", () => {
  let synkro: Synkro;

  afterEach(async () => {
    await synkro?.stop();
  });

  // ───────────────────────────── Events ─────────────────────────────

  describe("events", () => {
    it("should deliver an event to its handler with correct payload and requestId", async () => {
      const received: HandlerCtx[] = [];

      synkro = await startInMemory({
        events: [
          {
            type: "user:created",
            handler: (ctx) => {
              received.push({ ...ctx });
            },
          },
        ],
      });

      const requestId = await synkro.publish("user:created", {
        name: "Alice",
      });
      await settle();

      expect(received).toHaveLength(1);
      expect(received[0]!.requestId).toBe(requestId);
      expect(received[0]!.payload).toEqual({ name: "Alice" });
    });

    it("should invoke multiple handlers registered for the same event", async () => {
      const calls: string[] = [];

      synkro = await startInMemory({
        events: [
          {
            type: "order:placed",
            handler: () => {
              calls.push("handler-1");
            },
          },
          {
            type: "order:placed",
            handler: () => {
              calls.push("handler-2");
            },
          },
        ],
      });

      await synkro.publish("order:placed", { orderId: 1 });
      await settle();

      expect(calls).toContain("handler-1");
      expect(calls).toContain("handler-2");
      expect(calls).toHaveLength(2);
    });

    it("should register handlers at runtime via on()", async () => {
      const received: unknown[] = [];

      synkro = await startInMemory({});
      synkro.on("late:event", (ctx) => {
        received.push(ctx.payload);
      });

      await synkro.publish("late:event", { value: 42 });
      await settle();

      expect(received).toEqual([{ value: 42 }]);
    });
  });

  // ───────────────────────────── Metrics ─────────────────────────────

  describe("metrics", () => {
    it("should track received and completed counts for successful events", async () => {
      synkro = await startInMemory({
        events: [{ type: "ping", handler: () => {} }],
      });

      await synkro.publish("ping");
      await settle();

      const metrics = await synkro.getEventMetrics("ping");
      expect(metrics.received).toBe(1);
      expect(metrics.completed).toBe(1);
      expect(metrics.failed).toBe(0);
    });

    it("should track failed count when a handler throws", async () => {
      synkro = await startInMemory({
        events: [
          {
            type: "boom",
            handler: () => {
              throw new Error("handler error");
            },
          },
        ],
      });

      await synkro.publish("boom");
      await settle();

      const metrics = await synkro.getEventMetrics("boom");
      expect(metrics.received).toBe(1);
      expect(metrics.completed).toBe(0);
      expect(metrics.failed).toBe(1);
    });
  });

  // ───────────────────────────── Introspection ─────────────────────────────

  describe("introspection", () => {
    it("should return registered events and workflows", async () => {
      synkro = await startInMemory({
        events: [{ type: "evt-a", handler: () => {} }],
        workflows: [
          {
            name: "wf-a",
            steps: [
              { type: "step-1", handler: () => {} },
              { type: "step-2", handler: () => {} },
            ],
          },
        ],
      });

      const info = synkro.introspect();
      expect(info.events.map((e) => e.type)).toContain("evt-a");
      expect(info.workflows).toHaveLength(1);
      expect(info.workflows[0]!.name).toBe("wf-a");
      expect(info.workflows[0]!.steps.map((s) => s.type)).toEqual([
        "step-1",
        "step-2",
      ]);
    });
  });

  // ───────────────────────────── Linear Workflow ─────────────────────────────

  describe("linear workflow", () => {
    it("should execute steps in order passing the original payload through", async () => {
      const order: string[] = [];
      const payloads: unknown[] = [];

      synkro = await startInMemory({
        workflows: [
          {
            name: "pipeline",
            steps: [
              {
                type: "Extract",
                handler: (ctx) => {
                  order.push("Extract");
                  payloads.push(ctx.payload);
                },
              },
              {
                type: "Transform",
                handler: (ctx) => {
                  order.push("Transform");
                  payloads.push(ctx.payload);
                },
              },
              {
                type: "Load",
                handler: (ctx) => {
                  order.push("Load");
                  payloads.push(ctx.payload);
                },
              },
            ],
          },
        ],
      });

      await synkro.publish("pipeline", { source: "db" });
      await settle();

      expect(order).toEqual(["Extract", "Transform", "Load"]);
      for (const p of payloads) {
        expect(p).toEqual({ source: "db" });
      }
    });
  });

  // ───────────────────────────── Parallel Workflow ─────────────────────────────

  describe("parallel workflow", () => {
    it("should execute independent steps in parallel and dependent step after both complete", async () => {
      const order: string[] = [];

      synkro = await startInMemory({
        workflows: [
          {
            name: "parallel-pipeline",
            steps: [
              {
                type: "FetchA",
                handler: () => {
                  order.push("FetchA");
                },
              },
              {
                type: "FetchB",
                handler: () => {
                  order.push("FetchB");
                },
              },
              {
                type: "Merge",
                handler: () => {
                  order.push("Merge");
                },
                dependsOn: ["FetchA", "FetchB"],
              },
            ],
          },
        ],
      });

      const requestId = await synkro.publish("parallel-pipeline", { source: "api" });
      await settle();

      // FetchA and FetchB should have run (order may vary), then Merge
      expect(order).toContain("FetchA");
      expect(order).toContain("FetchB");
      expect(order[2]).toBe("Merge");

      const state = await synkro.getWorkflowState(requestId, "parallel-pipeline");
      expect(state?.status).toBe("completed");
    });

    it("should complete parallel workflow and trigger chained workflow", async () => {
      const order: string[] = [];

      synkro = await startInMemory({
        workflows: [
          {
            name: "parallel-main",
            steps: [
              { type: "A", handler: () => { order.push("A"); } },
              { type: "B", handler: () => { order.push("B"); } },
              { type: "C", handler: () => { order.push("C"); }, dependsOn: ["A", "B"] },
            ],
            onComplete: "cleanup",
          },
          {
            name: "cleanup",
            steps: [
              { type: "Cleanup", handler: () => { order.push("Cleanup"); } },
            ],
          },
        ],
      });

      await synkro.publish("parallel-main", {});
      await settle();

      expect(order).toContain("A");
      expect(order).toContain("B");
      expect(order).toContain("C");
      expect(order).toContain("Cleanup");
      // C must come after A and B, Cleanup must come after C
      expect(order.indexOf("C")).toBeGreaterThan(order.indexOf("A"));
      expect(order.indexOf("C")).toBeGreaterThan(order.indexOf("B"));
      expect(order.indexOf("Cleanup")).toBeGreaterThan(order.indexOf("C"));
    });

    it("should fail-fast when a parallel step fails", async () => {
      const order: string[] = [];

      synkro = await startInMemory({
        workflows: [
          {
            name: "parallel-fail",
            steps: [
              {
                type: "A",
                handler: () => {
                  order.push("A");
                  throw new Error("A failed");
                },
              },
              { type: "B", handler: () => { order.push("B"); } },
              { type: "C", handler: () => { order.push("C"); }, dependsOn: ["A", "B"] },
            ],
          },
        ],
      });

      const requestId = await synkro.publish("parallel-fail", {});
      await settle();

      // C should never execute since A failed
      expect(order).not.toContain("C");
    });

    it("should generate dependsOn edges in graph for parallel workflows", async () => {
      synkro = await startInMemory({
        workflows: [
          {
            name: "par-graph",
            steps: [
              { type: "A", handler: () => {} },
              { type: "B", handler: () => {} },
              { type: "C", handler: () => {}, dependsOn: ["A", "B"] },
            ],
          },
        ],
      });

      const graph = synkro.getWorkflowGraph("par-graph");
      expect(graph).not.toBeNull();
      expect(graph!.nodes).toHaveLength(3);
      expect(graph!.edges).toEqual([
        { from: "A", to: "C", label: "dependsOn" },
        { from: "B", to: "C", label: "dependsOn" },
      ]);
    });
  });

  // ───────────────────────────── Workflow Branching ─────────────────────────────

  describe("workflow branching", () => {
    it("should follow onSuccess branch when step succeeds", async () => {
      const order: string[] = [];

      synkro = await startInMemory({
        workflows: [
          {
            name: "deploy",
            steps: [
              {
                type: "RunTests",
                handler: () => {
                  order.push("RunTests");
                },
                onSuccess: "DeployProd",
                onFailure: "Rollback",
              },
              {
                type: "DeployProd",
                handler: () => {
                  order.push("DeployProd");
                },
              },
              {
                type: "Rollback",
                handler: () => {
                  order.push("Rollback");
                },
              },
            ],
          },
        ],
      });

      await synkro.publish("deploy", {});
      await settle();

      expect(order).toEqual(["RunTests", "DeployProd"]);
      expect(order).not.toContain("Rollback");
    });

    it("should follow onFailure branch when step fails", async () => {
      const order: string[] = [];

      synkro = await startInMemory({
        workflows: [
          {
            name: "deploy-fail",
            steps: [
              {
                type: "RunTests",
                handler: () => {
                  order.push("RunTests");
                  throw new Error("tests failed");
                },
                onFailure: "Rollback",
              },
              {
                type: "DeployProd",
                handler: () => {
                  order.push("DeployProd");
                },
              },
              {
                type: "Rollback",
                handler: () => {
                  order.push("Rollback");
                },
              },
            ],
          },
        ],
      });

      await synkro.publish("deploy-fail", {});
      await settle();

      expect(order).toEqual(["RunTests", "Rollback"]);
      expect(order).not.toContain("DeployProd");
    });
  });

  // ───────────────────────────── Workflow Chaining ─────────────────────────────

  describe("workflow chaining", () => {
    it("should trigger onSuccess workflow when workflow completes successfully", async () => {
      const order: string[] = [];

      synkro = await startInMemory({
        workflows: [
          {
            name: "main-flow",
            steps: [
              {
                type: "DoWork",
                handler: () => {
                  order.push("DoWork");
                },
              },
            ],
            onSuccess: "notify-flow",
          },
          {
            name: "notify-flow",
            steps: [
              {
                type: "SendNotification",
                handler: () => {
                  order.push("SendNotification");
                },
              },
            ],
          },
        ],
      });

      await synkro.publish("main-flow", {});
      await settle();

      expect(order).toEqual(["DoWork", "SendNotification"]);
    });

    it("should trigger onFailure workflow when workflow fails", async () => {
      const order: string[] = [];

      synkro = await startInMemory({
        workflows: [
          {
            name: "risky-flow",
            steps: [
              {
                type: "RiskyStep",
                handler: () => {
                  order.push("RiskyStep");
                  throw new Error("kaboom");
                },
              },
            ],
            onFailure: "recovery-flow",
          },
          {
            name: "recovery-flow",
            steps: [
              {
                type: "Recover",
                handler: () => {
                  order.push("Recover");
                },
              },
            ],
          },
        ],
      });

      await synkro.publish("risky-flow", {});
      await settle();

      expect(order).toEqual(["RiskyStep", "Recover"]);
    });

    it("should trigger onComplete workflow regardless of outcome", async () => {
      const order: string[] = [];

      synkro = await startInMemory({
        workflows: [
          {
            name: "any-flow",
            steps: [
              {
                type: "Step1",
                handler: () => {
                  order.push("Step1");
                },
              },
            ],
            onComplete: "cleanup-flow",
          },
          {
            name: "cleanup-flow",
            steps: [
              {
                type: "Cleanup",
                handler: () => {
                  order.push("Cleanup");
                },
              },
            ],
          },
        ],
      });

      await synkro.publish("any-flow", {});
      await settle();

      expect(order).toEqual(["Step1", "Cleanup"]);
    });
  });

  // ───────────────────────────── Off / Unsubscribe ─────────────────────────────

  describe("off()", () => {
    it("should stop delivering events after off() with specific handler", async () => {
      const received: unknown[] = [];
      const handler = (ctx: HandlerCtx) => {
        received.push(ctx.payload);
      };

      synkro = await startInMemory({});
      synkro.on("test:off", handler);

      await synkro.publish("test:off", { n: 1 });
      await settle();
      expect(received).toHaveLength(1);

      synkro.off("test:off", handler);

      await synkro.publish("test:off", { n: 2 });
      await settle();
      expect(received).toHaveLength(1);
    });

    it("should stop delivering all events after off() with no handler", async () => {
      const calls: string[] = [];

      synkro = await startInMemory({
        events: [
          { type: "test:off-all", handler: () => { calls.push("a"); } },
          { type: "test:off-all", handler: () => { calls.push("b"); } },
        ],
      });

      await synkro.publish("test:off-all");
      await settle();
      expect(calls).toHaveLength(2);

      synkro.off("test:off-all");

      await synkro.publish("test:off-all");
      await settle();
      expect(calls).toHaveLength(2);
    });
  });

  // ───────────────────────────── Workflow State Query ─────────────────────────────

  describe("workflow state query", () => {
    it("should return completed state after workflow finishes", async () => {
      synkro = await startInMemory({
        workflows: [
          {
            name: "query-wf",
            steps: [{ type: "Step1", handler: () => {} }],
          },
        ],
      });

      const requestId = await synkro.publish("query-wf", {});
      await settle();

      const state = await synkro.getWorkflowState(requestId, "query-wf");
      expect(state).not.toBeNull();
      expect(state!.status).toBe("completed");
      expect(state!.workflowName).toBe("query-wf");
    });

    it("should return null for unknown workflow", async () => {
      synkro = await startInMemory({});
      const state = await synkro.getWorkflowState("unknown-id", "unknown-wf");
      expect(state).toBeNull();
    });
  });

  // ───────────────────────────── Workflow Cancellation ─────────────────────────────

  describe("workflow cancellation", () => {
    it("should stop workflow progression when cancelled mid-execution", async () => {
      const order: string[] = [];
      let step1Resolve: () => void;
      const step1Started = new Promise<void>((resolve) => {
        step1Resolve = resolve;
      });

      synkro = await startInMemory({
        workflows: [
          {
            name: "cancel-wf",
            steps: [
              {
                type: "Slow",
                handler: async () => {
                  order.push("Slow");
                  step1Resolve();
                  await new Promise((r) => setTimeout(r, 50));
                },
              },
              {
                type: "Fast",
                handler: () => {
                  order.push("Fast");
                },
              },
            ],
          },
        ],
      });

      const requestId = await synkro.publish("cancel-wf", {});
      await step1Started;

      const cancelled = await synkro.cancelWorkflow(requestId, "cancel-wf");
      expect(cancelled).toBe(true);

      await settle();

      expect(order).toEqual(["Slow"]);
      expect(order).not.toContain("Fast");

      const state = await synkro.getWorkflowState(requestId, "cancel-wf");
      expect(state!.status).toBe("cancelled");
    });

    it("should return false when cancelling a completed workflow", async () => {
      synkro = await startInMemory({
        workflows: [
          {
            name: "done-wf",
            steps: [{ type: "Step1", handler: () => {} }],
          },
        ],
      });

      const requestId = await synkro.publish("done-wf", {});
      await settle();

      const cancelled = await synkro.cancelWorkflow(requestId, "done-wf");
      expect(cancelled).toBe(false);
    });

    it("should return false for unknown requestId", async () => {
      synkro = await startInMemory({});
      const cancelled = await synkro.cancelWorkflow("unknown", "unknown");
      expect(cancelled).toBe(false);
    });
  });

  // ───────────────────────────── Decorator-Based Handlers ─────────────────────────────

  describe("decorator-based handlers", () => {
    it("should discover and invoke @OnEvent handlers", async () => {
      const received: unknown[] = [];

      class Handlers {
        @OnEvent("item:sold")
        onItemSold(ctx: HandlerCtx) {
          received.push(ctx.payload);
        }
      }

      synkro = await startInMemory({
        handlers: [new Handlers()],
      });

      await synkro.publish("item:sold", { sku: "ABC" });
      await settle();

      expect(received).toEqual([{ sku: "ABC" }]);
    });

    it("should discover and invoke @OnWorkflowStep handlers", async () => {
      const order: string[] = [];

      class StepHandlers {
        @OnWorkflowStep("signup", "CreateAccount")
        createAccount(ctx: HandlerCtx) {
          order.push("CreateAccount");
          ctx.setPayload({ accountId: "acc-1" });
        }

        @OnWorkflowStep("signup", "SendWelcome")
        sendWelcome(_ctx: HandlerCtx) {
          order.push("SendWelcome");
        }
      }

      synkro = await startInMemory({
        workflows: [
          {
            name: "signup",
            steps: [{ type: "CreateAccount" }, { type: "SendWelcome" }],
          },
        ],
        handlers: [new StepHandlers()],
      });

      await synkro.publish("signup", { email: "bob@test.com" });
      await settle();

      expect(order).toEqual(["CreateAccount", "SendWelcome"]);
    });

    it("should support runtime registration via register()", async () => {
      const received: unknown[] = [];

      class LateHandlers {
        @OnEvent("late:decorated")
        onLate(ctx: HandlerCtx) {
          received.push(ctx.payload);
        }
      }

      synkro = await startInMemory({});
      synkro.register(new LateHandlers());

      await synkro.publish("late:decorated", { late: true });
      await settle();

      expect(received).toEqual([{ late: true }]);
    });
  });

  // ───────────────────────────── Event Versioning ─────────────────────────────

  describe("event versioning", () => {
    it("should deliver versioned event to base handler with _version metadata", async () => {
      const received: HandlerCtx[] = [];

      synkro = await startInMemory({
        events: [
          {
            type: "user:created",
            handler: (ctx) => {
              received.push({ ...ctx });
            },
          },
        ],
      });

      await synkro.publish("user:created:v2", { name: "Alice" });
      await settle();

      expect(received).toHaveLength(1);
      expect((received[0]!.payload as Record<string, unknown>).name).toBe("Alice");
    });

    it("should deliver versioned event to version-specific handler", async () => {
      const received: HandlerCtx[] = [];

      synkro = await startInMemory({
        events: [
          {
            type: "user:created:v2",
            handler: (ctx) => {
              received.push({ ...ctx });
            },
          },
        ],
      });

      await synkro.publish("user:created:v2", { name: "Bob" });
      await settle();

      expect(received).toHaveLength(1);
      expect((received[0]!.payload as Record<string, unknown>).name).toBe("Bob");
    });

    it("should deliver versioned event to both base and version-specific handlers", async () => {
      const baseCalls: unknown[] = [];
      const versionedCalls: unknown[] = [];

      synkro = await startInMemory({
        events: [
          {
            type: "order:placed",
            handler: (ctx) => {
              baseCalls.push(ctx.payload);
            },
          },
          {
            type: "order:placed:v2",
            handler: (ctx) => {
              versionedCalls.push(ctx.payload);
            },
          },
        ],
      });

      await synkro.publish("order:placed:v2", { orderId: 1 });
      await settle();

      expect(versionedCalls).toHaveLength(1);
      expect(baseCalls).toHaveLength(1);
    });

    it("should NOT deliver unversioned event to version-specific handler", async () => {
      const baseCalls: unknown[] = [];
      const versionedCalls: unknown[] = [];

      synkro = await startInMemory({
        events: [
          {
            type: "item:sold",
            handler: (ctx) => {
              baseCalls.push(ctx.payload);
            },
          },
          {
            type: "item:sold:v2",
            handler: (ctx) => {
              versionedCalls.push(ctx.payload);
            },
          },
        ],
      });

      await synkro.publish("item:sold", { sku: "ABC" });
      await settle();

      expect(baseCalls).toHaveLength(1);
      expect(versionedCalls).toHaveLength(0);
    });

    it("should track metrics for both versioned and base events", async () => {
      synkro = await startInMemory({
        events: [
          { type: "metric:evt", handler: () => {} },
          { type: "metric:evt:v3", handler: () => {} },
        ],
      });

      await synkro.publish("metric:evt:v3", {});
      await settle();

      const baseMetrics = await synkro.getEventMetrics("metric:evt");
      const versionedMetrics = await synkro.getEventMetrics("metric:evt:v3");

      expect(baseMetrics.received).toBe(1);
      expect(baseMetrics.completed).toBe(1);
      expect(versionedMetrics.received).toBe(1);
      expect(versionedMetrics.completed).toBe(1);
    });
  });

  // ───────────────────────────── Middleware ─────────────────────────────

  describe("middleware", () => {
    it("should invoke middleware around handler execution", async () => {
      const order: string[] = [];

      const mw: MiddlewareFunction = async (_ctx, next) => {
        order.push("mw-before");
        await next();
        order.push("mw-after");
      };

      synkro = await startInMemory({
        middlewares: [mw],
        events: [
          {
            type: "mw:test",
            handler: () => {
              order.push("handler");
            },
          },
        ],
      });

      await synkro.publish("mw:test", {});
      await settle();

      expect(order).toEqual(["mw-before", "handler", "mw-after"]);
    });

    it("should execute multiple middlewares in registration order", async () => {
      const order: string[] = [];

      synkro = await startInMemory({
        events: [
          {
            type: "mw:multi",
            handler: () => {
              order.push("handler");
            },
          },
        ],
      });

      synkro.use(async (_ctx, next) => {
        order.push("mw1-before");
        await next();
        order.push("mw1-after");
      });

      synkro.use(async (_ctx, next) => {
        order.push("mw2-before");
        await next();
        order.push("mw2-after");
      });

      await synkro.publish("mw:multi", {});
      await settle();

      expect(order).toEqual([
        "mw1-before",
        "mw2-before",
        "handler",
        "mw2-after",
        "mw1-after",
      ]);
    });

    it("should apply middleware independently to each handler for the same event", async () => {
      const calls: string[] = [];

      const mw: MiddlewareFunction = async (ctx, next) => {
        calls.push(`mw:${ctx.eventType}`);
        await next();
      };

      synkro = await startInMemory({
        middlewares: [mw],
        events: [
          {
            type: "mw:each",
            handler: () => {
              calls.push("handler-1");
            },
          },
          {
            type: "mw:each",
            handler: () => {
              calls.push("handler-2");
            },
          },
        ],
      });

      await synkro.publish("mw:each", {});
      await settle();

      expect(calls.filter((c) => c === "mw:mw:each")).toHaveLength(2);
      expect(calls).toContain("handler-1");
      expect(calls).toContain("handler-2");
    });

    it("should provide eventType in middleware context", async () => {
      let capturedEventType: string | undefined;

      const mw: MiddlewareFunction = async (ctx, next) => {
        capturedEventType = ctx.eventType;
        await next();
      };

      synkro = await startInMemory({
        middlewares: [mw],
        events: [{ type: "mw:ctx", handler: () => {} }],
      });

      await synkro.publish("mw:ctx", {});
      await settle();

      expect(capturedEventType).toBe("mw:ctx");
    });
  });

  // ───────────────────────────── Scheduled & Delayed Events ─────────────────────────────

  describe("scheduled and delayed events", () => {
    it("should deliver a delayed event after the specified delay", async () => {
      vi.useFakeTimers();
      const received: unknown[] = [];

      synkro = await startInMemory({
        events: [
          {
            type: "delayed:event",
            handler: (ctx) => {
              received.push(ctx.payload);
            },
          },
        ],
      });

      const requestId = synkro.publishDelayed("delayed:event", { a: 1 }, 3000);
      expect(typeof requestId).toBe("string");
      expect(received).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(3000);
      // settle microtasks with fake timers
      for (let i = 0; i < 30; i++) {
        await vi.advanceTimersByTimeAsync(0);
      }

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ a: 1 });

      vi.useRealTimers();
    });

    it("should deliver recurring events on schedule", async () => {
      vi.useFakeTimers();
      const received: unknown[] = [];

      synkro = await startInMemory({
        events: [
          {
            type: "recurring:event",
            handler: (ctx) => {
              received.push(ctx.payload);
            },
          },
        ],
      });

      const scheduleId = synkro.schedule("recurring:event", 1000, { tick: true });
      expect(typeof scheduleId).toBe("string");

      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000);
        for (let j = 0; j < 30; j++) {
          await vi.advanceTimersByTimeAsync(0);
        }
      }

      expect(received.length).toBeGreaterThanOrEqual(3);

      synkro.unschedule(scheduleId);
      vi.useRealTimers();
    });

    it("should stop recurring events after unschedule", async () => {
      vi.useFakeTimers();
      let count = 0;

      synkro = await startInMemory({
        events: [
          {
            type: "unsched:event",
            handler: () => {
              count++;
            },
          },
        ],
      });

      const id = synkro.schedule("unsched:event", 1000);

      await vi.advanceTimersByTimeAsync(2000);
      for (let j = 0; j < 30; j++) {
        await vi.advanceTimersByTimeAsync(0);
      }

      const countBefore = count;
      synkro.unschedule(id);

      await vi.advanceTimersByTimeAsync(5000);
      for (let j = 0; j < 30; j++) {
        await vi.advanceTimersByTimeAsync(0);
      }

      expect(count).toBe(countBefore);

      vi.useRealTimers();
    });

    it("should include active schedules in introspect()", async () => {
      synkro = await startInMemory({});

      synkro.schedule("sched:a", 5000, { job: "a" });
      synkro.schedule("sched:b", 10000);

      const info = synkro.introspect();
      expect(info.schedules).toHaveLength(2);
      expect(info.schedules.map((s) => s.eventType).sort()).toEqual(["sched:a", "sched:b"]);
    });

    it("should clear all timers on stop()", async () => {
      vi.useFakeTimers();
      let count = 0;

      synkro = await startInMemory({
        events: [{ type: "stop:event", handler: () => { count++; } }],
      });

      synkro.schedule("stop:event", 1000);
      synkro.publishDelayed("stop:event", {}, 2000);

      await synkro.stop();

      await vi.advanceTimersByTimeAsync(10000);
      expect(count).toBe(0);

      vi.useRealTimers();
    });
  });

  // ───────────────────────────── Workflow DAG Export ─────────────────────────────

  describe("workflow DAG export", () => {
    it("should return null for unknown workflow", async () => {
      synkro = await startInMemory({});
      expect(synkro.getWorkflowGraph("unknown")).toBeNull();
    });

    it("should return graph for a linear workflow", async () => {
      synkro = await startInMemory({
        workflows: [
          {
            name: "linear",
            steps: [
              { type: "A", handler: () => {} },
              { type: "B", handler: () => {} },
              { type: "C", handler: () => {} },
            ],
          },
        ],
      });

      const graph = synkro.getWorkflowGraph("linear");
      expect(graph).not.toBeNull();
      expect(graph!.workflowName).toBe("linear");
      expect(graph!.nodes).toHaveLength(3);
      expect(graph!.nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);

      // Sequential edges: A→B, B→C
      const nextEdges = graph!.edges.filter((e) => e.label === "next");
      expect(nextEdges).toEqual([
        { from: "A", to: "B", label: "next" },
        { from: "B", to: "C", label: "next" },
      ]);
    });

    it("should return graph for a branching workflow", async () => {
      synkro = await startInMemory({
        workflows: [
          {
            name: "branching",
            steps: [
              {
                type: "Validate",
                handler: () => {},
                onSuccess: "Process",
                onFailure: "Reject",
              },
              { type: "Process", handler: () => {} },
              { type: "Reject", handler: () => {} },
            ],
          },
        ],
      });

      const graph = synkro.getWorkflowGraph("branching");
      expect(graph!.nodes).toHaveLength(3);

      const onSuccessEdges = graph!.edges.filter((e) => e.label === "onSuccess");
      const onFailureEdges = graph!.edges.filter((e) => e.label === "onFailure");

      expect(onSuccessEdges).toEqual([{ from: "Validate", to: "Process", label: "onSuccess" }]);
      expect(onFailureEdges).toEqual([{ from: "Validate", to: "Reject", label: "onFailure" }]);

      // No "next" edge from Validate since it has onSuccess
      const nextFromValidate = graph!.edges.filter((e) => e.from === "Validate" && e.label === "next");
      expect(nextFromValidate).toHaveLength(0);
    });

    it("should include step metadata in nodes", async () => {
      synkro = await startInMemory({
        workflows: [
          {
            name: "with-meta",
            steps: [
              {
                type: "StepA",
                handler: () => {},
                retry: { maxRetries: 3 },
                timeoutMs: 5000,
              },
            ],
          },
        ],
      });

      const graph = synkro.getWorkflowGraph("with-meta");
      expect(graph!.nodes[0]!.meta).toEqual({
        retry: { maxRetries: 3 },
        timeoutMs: 5000,
      });
    });

    it("should include graphs in introspect()", async () => {
      synkro = await startInMemory({
        workflows: [
          {
            name: "wf-1",
            steps: [{ type: "S1", handler: () => {} }],
          },
          {
            name: "wf-2",
            steps: [
              { type: "S1", handler: () => {} },
              { type: "S2", handler: () => {} },
            ],
          },
        ],
      });

      const info = synkro.introspect();
      expect(info.graphs).toHaveLength(2);
      expect(info.graphs.map((g) => g.workflowName).sort()).toEqual(["wf-1", "wf-2"]);
    });

    it("should handle single-step workflow", async () => {
      synkro = await startInMemory({
        workflows: [
          {
            name: "single",
            steps: [{ type: "Only", handler: () => {} }],
          },
        ],
      });

      const graph = synkro.getWorkflowGraph("single");
      expect(graph!.nodes).toHaveLength(1);
      expect(graph!.edges).toHaveLength(0);
    });
  });
});
