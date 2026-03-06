# @orko/core

Lightweight workflow and state machine orchestrator. Define event-driven workflows via configuration or code. Supports Redis and in-memory transports.

## Features

- **Standalone Events** — Simple pub/sub event handlers
- **Sequential Workflows** — Multi-step workflows that execute in order, with state persistence
- **Conditional Routing** — Branch to different steps based on handler success or failure
- **Workflow Chaining** — Trigger follow-up workflows on completion, success, or failure
- **Retry Support** — Configurable retry logic per step
- **Transport Options** — Redis for production or in-memory for simple projects and local development
- **Simple API** — Single `Orko` class with minimal configuration
- **TypeScript** — Full type support out of the box

## Installation

```bash
npm install @orko/core
```

## Quick Start

### In-Memory (no external dependencies)

```ts
import { Orko } from "@orko/core";

const orko = await Orko.start({
  transport: "in-memory",
  events: [
    {
      type: "UserSignedUp",
      handler: async (ctx) => {
        console.log("New user:", ctx.payload);
      },
    },
  ],
});

await orko.publish("UserSignedUp", { email: "user@example.com" });
```

### Redis (scalable, multi-instance)

> Requires a running Redis instance.

```ts
import { Orko } from "@orko/core";

const orko = await Orko.start({
  transport: "redis",
  connectionUrl: "redis://localhost:6379",
  events: [
    {
      type: "UserSignedUp",
      handler: async (ctx) => {
        console.log("New user:", ctx.payload);
      },
    },
  ],
});

await orko.publish("UserSignedUp", { email: "user@example.com" });
```

> The in-memory transport is ideal for simple projects, local development, and testing. For production workloads that require scaling across multiple instances, use Redis.

## Workflows

Define multi-step sequential workflows. Each step runs after the previous one completes, with state automatically persisted.

```ts
const orko = await Orko.start({
  transport: "redis",
  connectionUrl: "redis://localhost:6379",
  workflows: [
    {
      name: "ProcessOrder",
      steps: [
        {
          type: "ValidateStock",
          handler: async (ctx) => {
            console.log("Checking stock for order:", ctx.requestId);
          },
        },
        {
          type: "ProcessPayment",
          handler: async (ctx) => {
            console.log("Processing payment...");
          },
        },
        {
          type: "SendConfirmation",
          handler: async (ctx) => {
            console.log("Order confirmed!");
          },
        },
      ],
    },
  ],
});

// Triggers all 3 steps in sequence
await orko.publish("ProcessOrder", { orderId: "abc-123", amount: 49.99 });
```

### Conditional Routing

Use `onSuccess` and `onFailure` on a step to branch to different steps based on the handler outcome. If a handler throws (after all retries), the workflow routes to the `onFailure` step. On success, it routes to the `onSuccess` step.

```ts
{
  name: "ProcessDocument",
  steps: [
    {
      type: "RunOCR",
      handler: ocrHandler,
      retry: { maxRetries: 2 },
      onSuccess: "ProcessingSucceeded",
      onFailure: "ProcessingFailed",
    },
    {
      type: "ProcessingSucceeded",
      handler: async (ctx) => {
        console.log("OCR completed successfully");
      },
    },
    {
      type: "ProcessingFailed",
      handler: async (ctx) => {
        console.log("OCR failed, notifying support");
      },
    },
  ],
}
```

Steps referenced by `onSuccess`/`onFailure` are treated as branch targets. When a branch target completes, the workflow skips over sibling branch targets and advances to the next regular step (if any), or completes.

```ts
{
  name: "ProcessOrder",
  steps: [
    {
      type: "Payment",
      handler: paymentHandler,
      onSuccess: "PaymentCompleted",
      onFailure: "PaymentFailed",
    },
    { type: "PaymentCompleted", handler: completedHandler },
    { type: "PaymentFailed", handler: failedHandler },
    { type: "SendNotification", handler: notifyHandler }, // runs after either branch
  ],
}
```

Steps without `onSuccess`/`onFailure` advance sequentially as before.

### Workflow Chaining

Trigger follow-up workflows when a workflow finishes:

- **`onSuccess`** — starts a workflow when the current one completes successfully
- **`onFailure`** — starts a workflow when the current one fails
- **`onComplete`** — starts a workflow regardless of outcome (runs after `onSuccess`/`onFailure`)

```ts
const workflows = [
  {
    name: "ProcessOrder",
    onSuccess: "StartShipment",
    onFailure: "HandleError",
    onComplete: "NotifyCustomer",
    steps: [
      { type: "ValidateStock", handler: stockHandler },
      { type: "ProcessPayment", handler: paymentHandler },
    ],
  },
  {
    name: "StartShipment",
    steps: [
      { type: "ShipOrder", handler: shipHandler },
    ],
  },
  {
    name: "HandleError",
    steps: [
      { type: "LogError", handler: errorHandler },
    ],
  },
  {
    name: "NotifyCustomer",
    steps: [
      { type: "SendEmail", handler: emailHandler },
    ],
  },
];
```

Chained workflows inherit the same `requestId` and `payload` from the completed workflow.

### Retry

Configure retries per step. The handler will be retried up to `maxRetries` times before being considered failed.

```ts
{
  type: "ProcessPayment",
  handler: paymentHandler,
  retry: { maxRetries: 3 },
}
```

## API

### `Orko.start(options): Promise<Orko>`

Creates and returns a running instance.

```ts
type OrkoOptions = {
  transport: "redis" | "in-memory";
  connectionUrl?: string; // required for external transports (e.g. Redis)
  debug?: boolean;
  events?: OrkoEvent[];
  workflows?: OrkoWorkflow[];
};
```

### `orko.on(eventType, handler, retry?): void`

Registers an event handler at runtime.

```ts
orko.on("StockUpdate", async (ctx) => {
  console.log(ctx.requestId, ctx.payload);
});
```

### `orko.publish(event, payload?, requestId?): Promise<string>`

Publishes an event or starts a workflow. Returns a `requestId` for correlation. A UUID is generated by default, but you can provide your own ID.

```ts
// Auto-generated UUID
const id = await orko.publish("UserSignedUp", { email: "user@example.com" });

// Custom request ID
const id = await orko.publish("UserSignedUp", { email: "user@example.com" }, "my-custom-id");
```

### `ctx.publish(event, payload?, requestId?): Promise<string>`

Publishes an event or starts a workflow from inside a handler. Same signature as `orko.publish`.

```ts
orko.on("OrderCompleted", async (ctx) => {
  const { orderId } = ctx.payload as { orderId: string };
  await ctx.publish("SendInvoice", { orderId });
});
```

### `ctx.setPayload(data): void`

Merges the given object into `ctx.payload`. The updated payload propagates to subsequent workflow steps and completion/failure events.

```ts
orko.on("ValidateStock", async (ctx) => {
  const available = true;
  ctx.setPayload({ stockAvailable: available });
  // ctx.payload is now { ...originalPayload, stockAvailable: true }
});
```

### `orko.stop(): Promise<void>`

Disconnects the transport and cleans up resources.

## Types

```ts
type RetryConfig = {
  maxRetries: number;
};

type OrkoEvent = {
  type: string;
  handler: HandlerFunction;
  retry?: RetryConfig;
};

type OrkoWorkflow = {
  name: string;
  steps: OrkoWorkflowStep[];
  onComplete?: string;
  onSuccess?: string;
  onFailure?: string;
};

type OrkoWorkflowStep = {
  type: string;
  handler: HandlerFunction;
  retry?: RetryConfig;
  onSuccess?: string;
  onFailure?: string;
};

type HandlerCtx = {
  requestId: string;
  payload: unknown;
  publish: PublishFunction;
  setPayload: (data: Record<string, unknown>) => void;
};

type PublishFunction = (
  event: string,
  payload?: unknown,
  requestId?: string,
) => Promise<string>;

type HandlerFunction = (ctx: HandlerCtx) => void | Promise<void>;
```

## License

ISC
