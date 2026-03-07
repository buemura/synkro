import { describe, it, expect, vi, afterEach } from "vitest";
import { Synkro, OnEvent, OnWorkflowStep } from "../index.js";
import type { HandlerCtx, SynkroEvent, SynkroWorkflow } from "../index.js";

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
});
