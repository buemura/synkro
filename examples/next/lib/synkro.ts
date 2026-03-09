import type { SynkroWorkflow } from "@synkro/core";
import { createSynkroServerless } from "@synkro/next";

// ---------------------------------------------------------------------------
// Workflow definitions (handlers are provided by the route handlers)
// ---------------------------------------------------------------------------

const workflows: SynkroWorkflow[] = [
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
  {
    name: "DeployService",
    timeoutMs: 10_000,
    steps: [
      { type: "BuildImage" },
      {
        type: "RunTests",
        onSuccess: "DeployToProduction",
        onFailure: "Rollback",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Handler route mapping — maps event types to HTTP route paths
// ---------------------------------------------------------------------------

const handlerRoutes = [
  // Standalone events
  { eventType: "UserSignedUp", url: "/api/events/user-signed-up" },
  { eventType: "PaymentReceived", url: "/api/events/payment-received" },

  // OrderProcessing workflow steps
  { eventType: "workflow:OrderProcessing:ValidateOrder", url: "/api/workflows/order/validate" },
  { eventType: "workflow:OrderProcessing:ProcessPayment", url: "/api/workflows/order/payment" },
  { eventType: "workflow:OrderProcessing:FulfillOrder", url: "/api/workflows/order/fulfill" },
  { eventType: "workflow:OrderProcessing:HandlePaymentFailure", url: "/api/workflows/order/payment-failure" },

  // DeployService workflow steps
  { eventType: "workflow:DeployService:BuildImage", url: "/api/workflows/deploy/build" },
  { eventType: "workflow:DeployService:RunTests", url: "/api/workflows/deploy/tests" },
  { eventType: "workflow:DeployService:DeployToProduction", url: "/api/workflows/deploy/production" },
  { eventType: "workflow:DeployService:Rollback", url: "/api/workflows/deploy/rollback" },
];

// ---------------------------------------------------------------------------
// Create serverless synkro instance
// ---------------------------------------------------------------------------

export const synkro = createSynkroServerless({
  connectionUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  secret: process.env.SYNKRO_SECRET,
  debug: process.env.SYNKRO_DEBUG === "true",
  workflows,
  handlerRoutes,
});
