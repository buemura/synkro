# @synkro/core

Lightweight workflow and state machine orchestrator. Define event-driven workflows via configuration or code. Supports Redis and in-memory transports.

## Features

- **Standalone Events** — Simple pub/sub event handlers
- **Sequential Workflows** — Multi-step workflows that execute in order, with state persistence
- **Conditional Routing** — Branch to different steps based on handler success or failure
- **Workflow Chaining** — Trigger follow-up workflows on completion, success, or failure
- **Retry Support** — Configurable retry logic per step
- **Transport Options** — Redis for production or in-memory for simple projects and local development
- **Schema Validation** — Optional payload validation at publish and handler dispatch time
- **Workflow Timeout** — Configurable timeouts per step or per workflow
- **Graceful Shutdown** — Drains active handlers before disconnecting
- **Workflow State Query** — Inspect running workflow state at any time
- **Workflow Cancellation** — Cancel running workflows programmatically
- **Handler Unsubscribe** — Remove event handlers at runtime with `off()`
- **Typed Payloads** — Generic `HandlerCtx<T>` for compile-time payload safety
- **Simple API** — Single `Synkro` class with minimal configuration
- **TypeScript** — Full type support out of the box

## Installation

```bash
npm install @synkro/core
```

## Quick Start

### In-Memory (no external dependencies)

```ts
import { Synkro } from "@synkro/core";

const synkro = await Synkro.start({
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

await synkro.publish("UserSignedUp", { email: "user@example.com" });
```

### Redis (scalable, multi-instance)

> Requires a running Redis instance.

```ts
import { Synkro } from "@synkro/core";

const synkro = await Synkro.start({
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

await synkro.publish("UserSignedUp", { email: "user@example.com" });
```

> The in-memory transport is ideal for simple projects, local development, and testing. For production workloads that require scaling across multiple instances, use Redis.

## Workflows

Define multi-step sequential workflows. Each step runs after the previous one completes, with state automatically persisted.

```ts
const synkro = await Synkro.start({
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
await synkro.publish("ProcessOrder", { orderId: "abc-123", amount: 49.99 });
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
  retry: {
    maxRetries: 3,
    delayMs: 500,
    backoff: "exponential",
    jitter: true,
    retryable: (err) => !(err instanceof ValidationError),
  },
}
```

### Schema Validation

Validate event payloads at publish time and handler dispatch. The `SchemaValidator` type is `(payload: unknown) => void` — just throw on invalid input. This works with **any validation library** (Zod, Joi, Valibot, etc.) or plain manual checks.

**Global schemas** — validated at publish time (rejects before the message is sent):

```ts
import { z } from "zod";

const synkro = await Synkro.start({
  transport: "redis",
  connectionUrl: "redis://localhost:6379",
  schemas: {
    "UserSignedUp": (payload) => z.object({ email: z.string().email() }).parse(payload),
    "OrderPlaced": (payload) => z.object({ orderId: z.string(), amount: z.number() }).parse(payload),
  },
  // ...
});

await synkro.publish("UserSignedUp", { email: "invalid" }); // throws ZodError
```

**Per-event schemas** — validated at both publish time and handler dispatch:

```ts
const synkro = await Synkro.start({
  events: [
    {
      type: "AuditLog",
      schema: (payload) => z.object({ action: z.string(), userId: z.string() }).parse(payload),
      handler: async (ctx) => {
        // payload is guaranteed valid here
      },
    },
  ],
});
```

**Manual validation** (no dependencies):

```ts
schemas: {
  "UserSignedUp": (payload) => {
    if (!payload || typeof payload !== "object" || !("email" in payload))
      throw new Error("email is required");
  },
}
```

## API

### `Synkro.start(options): Promise<Synkro>`

Creates and returns a running instance.

```ts
type SynkroOptions = {
  transport?: "redis" | "in-memory"; // defaults to "redis"
  connectionUrl?: string; // required for Redis transport
  debug?: boolean;
  events?: SynkroEvent[];
  workflows?: SynkroWorkflow[];
  handlers?: object[];
  retention?: RetentionConfig;
  schemas?: Record<string, SchemaValidator>; // global payload validators per event type
  drainTimeout?: number; // ms to wait for in-flight handlers on stop() (default: 5000)
};
```

### `synkro.on(eventType, handler, retry?): void`

Registers an event handler at runtime.

```ts
synkro.on("StockUpdate", async (ctx) => {
  console.log(ctx.requestId, ctx.payload);
});
```

### `synkro.publish(event, payload?, requestId?): Promise<string>`

Publishes an event or starts a workflow. Returns a `requestId` for correlation. A UUID is generated by default, but you can provide your own ID.

```ts
// Auto-generated UUID
const id = await synkro.publish("UserSignedUp", { email: "user@example.com" });

// Custom request ID
const id = await synkro.publish("UserSignedUp", { email: "user@example.com" }, "my-custom-id");
```

### `ctx.publish(event, payload?, requestId?): Promise<string>`

Publishes an event or starts a workflow from inside a handler. Same signature as `synkro.publish`.

```ts
synkro.on("OrderCompleted", async (ctx) => {
  const { orderId } = ctx.payload as { orderId: string };
  await ctx.publish("SendInvoice", { orderId });
});
```

### `ctx.setPayload(data): void`

Merges the given object into `ctx.payload`. The updated payload propagates to subsequent workflow steps and completion/failure events.

```ts
synkro.on("ValidateStock", async (ctx) => {
  const available = true;
  ctx.setPayload({ stockAvailable: available });
  // ctx.payload is now { ...originalPayload, stockAvailable: true }
});
```

### `synkro.off(eventType, handler?): void`

Removes an event handler at runtime. If `handler` is provided, only that specific handler is removed (by reference). If omitted, all handlers for the event type are removed.

```ts
const handler = (ctx) => console.log(ctx.payload);
synkro.on("StockUpdate", handler);

// Later: remove this specific handler
synkro.off("StockUpdate", handler);

// Or remove all handlers for the event type
synkro.off("StockUpdate");
```

### `synkro.getWorkflowState(requestId, workflowName): Promise<WorkflowState | null>`

Returns the current state of a workflow instance, or `null` if no state exists.

```ts
const state = await synkro.getWorkflowState(requestId, "ProcessOrder");
// { workflowName: "ProcessOrder", currentStep: 2, status: "running" }
```

### `synkro.cancelWorkflow(requestId, workflowName): Promise<boolean>`

Cancels a running workflow. Returns `true` if the workflow was cancelled, `false` if it was not in a cancellable state. Cancelled workflows will not advance to subsequent steps.

```ts
const cancelled = await synkro.cancelWorkflow(requestId, "ProcessOrder");
```

### `synkro.stop(): Promise<void>`

Gracefully shuts down. Waits for in-flight handlers to complete (up to `drainTimeout`), then disconnects the transport.

## Types

```ts
type RetryConfig = {
  maxRetries: number;
  delayMs?: number; // base delay in ms (default: 1000)
  backoff?: "fixed" | "exponential"; // delay strategy (default: "fixed")
  jitter?: boolean; // randomize delay ±50% (default: false)
  retryable?: (error: unknown) => boolean; // skip retries for non-retryable errors
};

type SchemaValidator = (payload: unknown) => void; // throws on invalid

type SynkroEvent<T = unknown> = {
  type: string;
  handler: HandlerFunction<T>;
  retry?: RetryConfig;
  schema?: SchemaValidator;
};

type SynkroWorkflow = {
  name: string;
  steps: SynkroWorkflowStep[];
  onComplete?: string;
  onSuccess?: string;
  onFailure?: string;
  timeoutMs?: number; // default timeout for all steps
};

type SynkroWorkflowStep = {
  type: string;
  handler: HandlerFunction;
  retry?: RetryConfig;
  onSuccess?: string;
  onFailure?: string;
  timeoutMs?: number; // overrides workflow-level timeout
};

type HandlerCtx<T = unknown> = {
  requestId: string;
  payload: T;
  publish: PublishFunction;
  setPayload: (data: Record<string, unknown>) => void;
};

type PublishFunction = (
  event: string,
  payload?: unknown,
  requestId?: string,
) => Promise<string>;

type HandlerFunction<T = unknown> = (ctx: HandlerCtx<T>) => void | Promise<void>;

type WorkflowState = {
  workflowName: string;
  currentStep: number;
  status: "running" | "completed" | "failed" | "cancelled";
};
```

## License

ISC
