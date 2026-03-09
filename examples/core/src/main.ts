import type { HandlerCtx, SynkroEvent, SynkroWorkflow } from "@synkro/core";
import { Synkro } from "@synkro/core";
import { createDashboardHandler } from "@synkro/ui";
import { createServer } from "node:http";
import { z } from "zod";

import { delay } from "./delay.js";
import {
  DataPipelineHandlers,
  DeploymentWorkflowHandlers,
  NotificationHandlers,
  OrderWorkflowHandlers,
} from "./handlers.js";

// ---------------------------------------------------------------------------
// 1. Standalone events (inline handlers)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1a. Schemas — SchemaValidator is (payload: unknown) => void (throws on invalid)
//     Works with Zod, Joi, or any validation library out of the box.
// ---------------------------------------------------------------------------

const InventoryLowSchema = z.object({
  sku: z.string(),
  remaining: z.number(),
});

const AuditLogSchema = z.object({
  action: z.string(),
  userId: z.string(),
});

// Global schemas — validated at publish time (throws on invalid payload)
const schemas = {
  InventoryLow: (payload: unknown) => InventoryLowSchema.parse(payload),
};

const events: SynkroEvent[] = [
  {
    type: "InventoryLow",
    handler: async (ctx: HandlerCtx) => {
      const { sku, remaining } = ctx.payload as { sku: string; remaining: number };
      await delay(500);
      console.log(
        `  [Inventory] (${ctx.requestId}) SKU ${sku} is low (${remaining} left), reordering...`,
      );
    },
  },
  {
    // Per-event schema — validated at publish time and handler dispatch
    type: "AuditLog",
    schema: (payload: unknown) => AuditLogSchema.parse(payload),
    handler: async (ctx: HandlerCtx) => {
      const { action, userId } = ctx.payload as { action: string; userId: string };
      await delay(500);
      console.log(
        `  [Audit] (${ctx.requestId}) User ${userId} performed "${action}"`,
      );
    },
  },
];

// ---------------------------------------------------------------------------
// 2. Workflows
// ---------------------------------------------------------------------------

const workflows: SynkroWorkflow[] = [
  // Simple linear workflow
  // HandlePaymentFailure is auto-registered as an implicit step (FT-14)
  {
    name: "OrderProcessing",
    steps: [
      { type: "ValidateOrder" },
      {
        type: "ProcessPayment",
        retry: { maxRetries: 2, backoff: "exponential" },
        onFailure: "HandlePaymentFailure",
      },
      { type: "FulfillOrder" },
    ],
  },

  // Workflow with inline handlers
  {
    name: "UserOnboarding",
    steps: [
      {
        type: "CreateAccount",
        handler: async (ctx: HandlerCtx) => {
          const { email } = ctx.payload as { email: string };
          await delay(500);
          console.log(
            `  [Onboarding] (${ctx.requestId}) Creating account for ${email}`,
          );
          ctx.setPayload({ accountId: "acc_" + Date.now() });
        },
      },
      {
        type: "SetupPreferences",
        handler: async (ctx: HandlerCtx) => {
          await delay(500);
          console.log(
            `  [Onboarding] (${ctx.requestId}) Setting default preferences`,
          );
        },
      },
      {
        type: "SendOnboardingEmail",
        handler: async (ctx: HandlerCtx) => {
          const { email } = ctx.payload as { email: string };
          await delay(500);
          console.log(
            `  [Onboarding] (${ctx.requestId}) Sending onboarding guide to ${email}`,
          );
          await ctx.publish("OnboardingComplete", ctx.payload, ctx.requestId);
        },
      },
    ],
  },

  // Deployment workflow — step-level onSuccess/onFailure routing + timeout
  // DeployToProduction and Rollback are auto-registered as implicit steps (FT-14)
  // Workflow-level timeout: if any step exceeds 10s, it triggers the failure path
  {
    name: "DeployService",
    timeoutMs: 10_000,
    steps: [
      { type: "BuildImage" },
      {
        type: "RunTests",
        timeoutMs: 5_000, // step-level override: 5s timeout for tests
        onSuccess: "DeployToProduction",
        onFailure: "Rollback",
      },
    ],
  },

  // Data pipeline workflow — workflow-level onSuccess/onFailure/onComplete
  // No step-level routing: if a step fails, the workflow fails immediately
  {
    name: "DataPipeline",
    steps: [
      { type: "ExtractData" },
      { type: "TransformData" },
      { type: "LoadData" },
    ],
    onSuccess: "PipelineNotify", // chained: runs only on success
    onFailure: "PipelineRecovery", // chained: runs only on failure
    onComplete: "PipelineCleanup", // chained: always runs
  },

  // Chained workflows (triggered by DataPipeline)
  {
    name: "PipelineNotify",
    steps: [{ type: "SendReport" }],
  },
  {
    name: "PipelineRecovery",
    steps: [{ type: "LogFailure" }, { type: "AlertOps" }],
  },
  {
    name: "PipelineCleanup",
    steps: [{ type: "ReleaseLocks" }],
  },
];

// ---------------------------------------------------------------------------
// 3. Bootstrap Synkro + Dashboard
// ---------------------------------------------------------------------------

async function main() {
  const synkro = await Synkro.start({
    transport: "redis",
    connectionUrl: "redis://localhost:6379",
    debug: false,
    events,
    workflows,
    schemas, // global schema validation (v0.14.0)
    drainTimeout: 3000, // graceful shutdown: wait up to 3s for active handlers (v0.14.0)
    handlers: [
      new NotificationHandlers(),
      new OrderWorkflowHandlers(),
      new DeploymentWorkflowHandlers(),
      new DataPipelineHandlers(),
    ],
    retention: {
      dedupTtl: 60, // dedup keys expire after 1 min (demo)
      stateTtl: 60, // workflow state kept for 1 min (demo)
      metricsTtl: 60, // metrics keys expire after 1 min (demo)
    },
  });

  // Standalone event for the onboarding completion chain
  synkro.on("OnboardingComplete", async (ctx) => {
    await delay(500);
    console.log(`  [Complete] (${ctx.requestId}) Onboarding finished`);
  });

  // --- Demo sequence ---

  async function runDemo() {
    console.log("\n>> Publishing standalone events\n");

    await synkro.publish("UserSignedUp", {
      email: "alice@example.com",
      name: "Alice",
    });

    await synkro.publish("PaymentReceived", {
      orderId: "ORD-001",
      amount: 59.99,
    });

    await synkro.publish("InventoryLow", {
      sku: "WIDGET-42",
      remaining: 3,
    });

    await synkro.publish("AuditLog", {
      action: "login",
      userId: "user_123",
    });

    await delay(3000);

    console.log("\n>> Starting OrderProcessing workflow\n");

    await synkro.publish("OrderProcessing", {
      orderId: "ORD-002",
      items: ["Widget A", "Gadget B"],
    });

    await delay(5000);

    console.log("\n>> Starting UserOnboarding workflow\n");

    await synkro.publish("UserOnboarding", {
      email: "bob@example.com",
      plan: "pro",
    });

    await delay(6000);

    // --- DeployService: step-level onSuccess/onFailure routing ---

    console.log("\n>> Starting DeployService workflow (success path)\n");
    console.log(
      "   BuildImage -> RunTests -> [onSuccess] -> DeployToProduction\n",
    );

    await synkro.publish("DeployService", {
      service: "api-gateway",
      version: "2.4.0",
    });

    await delay(5000);

    console.log("\n>> Starting DeployService workflow (failure path)\n");
    console.log("   BuildImage -> RunTests -> [onFailure] -> Rollback\n");

    await synkro.publish("DeployService", {
      service: "payment-service",
      version: "1.3.0",
      shouldFail: true,
    });

    await delay(5000);

    // --- DataPipeline: workflow-level onSuccess/onFailure/onComplete ---

    console.log("\n>> Starting DataPipeline workflow (success path)\n");
    console.log("   Extract -> Transform -> Load");
    console.log(
      "   then: PipelineNotify (onSuccess) + PipelineCleanup (onComplete)\n",
    );

    await synkro.publish("DataPipeline", {
      source: "analytics-db",
      destination: "data-warehouse",
    });

    await delay(6000);

    console.log("\n>> Starting DataPipeline workflow (failure path)\n");
    console.log("   Extract -> Transform (fails!)");
    console.log(
      "   then: PipelineRecovery (onFailure) + PipelineCleanup (onComplete)\n",
    );

    await synkro.publish("DataPipeline", {
      source: "legacy-system",
      destination: "data-warehouse",
      shouldFail: true,
    });

    await delay(6000);

    // --- Schema validation: publish with invalid payload ---

    console.log("\n>> Schema validation demo\n");

    try {
      await synkro.publish("InventoryLow", { sku: "WIDGET-99" }); // missing 'remaining'
    } catch (err) {
      console.log(
        `  [Schema] Global schema rejected InventoryLow: ${(err as Error).message}`,
      );
    }

    try {
      await synkro.publish("AuditLog", { action: "logout" }); // missing 'userId'
    } catch (err) {
      console.log(
        `  [Schema] Per-event schema rejected AuditLog: ${(err as Error).message}`,
      );
    }

    console.log("\n--- Demo complete. ---\n");
  }

  // --- HTTP server: Dashboard + trigger endpoint ---

  const dashboard = createDashboardHandler(synkro, { basePath: "/dashboard" });

  const server = createServer((req, res) => {
    if (req.url?.startsWith("/dashboard")) {
      return dashboard(req, res);
    }

    if (req.url === "/run" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "started" }));
      runDemo().catch(console.error);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(4000, () => {
    console.log("\n--- Synkro Example ---");
    console.log("Dashboard:  http://localhost:4000/dashboard");
    console.log("Run demo:   curl -X POST http://localhost:4000/run\n");
  });

  // Graceful shutdown (v0.14.0) — drains active handlers before disconnecting
  process.on("SIGINT", async () => {
    console.log("\n[Shutdown] Draining active handlers...");
    await synkro.stop();
    console.log("[Shutdown] Clean shutdown complete.");
    server.close();
    process.exit(0);
  });

  // Run once on startup
  await delay(500);
  await runDemo();
}

main().catch(console.error);
