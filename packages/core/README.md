# @synkro/core

Lightweight workflow and state machine orchestrator. Define event-driven workflows via configuration or code. Supports Redis and in-memory transports.

## Features

- **Standalone Events** — Simple pub/sub event handlers
- **Sequential Workflows** — Multi-step workflows that execute in order, with state persistence
- **Parallel Workflows** — Run independent steps concurrently with `dependsOn` dependency tracking
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
- **Event Versioning** — Versioned event types with automatic base-event fanout
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

### Parallel Execution

Use `dependsOn` to run steps concurrently. Steps without `dependsOn` start immediately in parallel; dependent steps wait for all their dependencies to complete.

```ts
{
  name: "BuildAndDeploy",
  steps: [
    { type: "LintCode", handler: lintHandler },
    { type: "RunTests", handler: testHandler },
    {
      type: "Deploy",
      handler: deployHandler,
      dependsOn: ["LintCode", "RunTests"], // waits for both to finish
    },
  ],
}
```

Workflows without any `dependsOn` fields continue to execute sequentially as before. When a parallel step fails (and has no `onFailure`), the workflow fails immediately. Dependency cycles and invalid references are detected at registration time.

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

### Event Versioning

Versioned event types follow the `base:event:vN` convention. When a versioned event is published, it is automatically delivered to both the versioned channel and the base channel:

```ts
// Handler on the base event receives ALL versions (catch-all)
synkro.on("user:created", async (ctx) => {
  console.log("Any version:", ctx.payload);
});

// Handler on a specific version receives only that version
synkro.on("user:created:v2", async (ctx) => {
  console.log("V2 only:", ctx.payload);
});

// Publishing a versioned event delivers to both handlers above
await synkro.publish("user:created:v2", { name: "Alice", role: "admin" });

// Publishing an unversioned event delivers only to the base handler
await synkro.publish("user:created", { name: "Bob" });
```

Utility exports for working with versioned event types:

```ts
import { parseEventType, isVersionedEvent } from "@synkro/core";

parseEventType("user:created:v2");
// { base: "user:created", version: 2, raw: "user:created:v2" }

isVersionedEvent("user:created:v2"); // true
isVersionedEvent("user:created");    // false
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
  middlewares?: MiddlewareFunction[]; // middleware chain applied to all handlers
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

Publishes an event or starts a workflow. Returns a `requestId` for correlation. A UUID is generated by default, but you can provide your own ID. When the event type is versioned (e.g., `user:created:v2`), the event is also delivered to the base channel (`user:created`).

```ts
// Auto-generated UUID
const id = await synkro.publish("UserSignedUp", { email: "user@example.com" });

// Custom request ID
const id = await synkro.publish("UserSignedUp", { email: "user@example.com" }, "my-custom-id");

// Versioned event — delivers to both "user:created:v2" and "user:created" channels
const id = await synkro.publish("user:created:v2", { name: "Alice" });
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

### `synkro.use(middleware): void`

Registers a middleware function that wraps every handler execution. Middlewares execute in registration order using the Koa-style onion model.

```ts
synkro.use(async (ctx, next) => {
  console.log(`[${ctx.eventType}] started`, ctx.requestId);
  const start = Date.now();
  await next();
  console.log(`[${ctx.eventType}] finished in ${Date.now() - start}ms`);
});
```

### `synkro.publishDelayed(event, payload, delayMs): string`

Publishes an event after a one-shot delay. Returns the `requestId` immediately.

```ts
const requestId = synkro.publishDelayed("reminder:send", { userId: "u1" }, 60_000);
```

### `synkro.schedule(eventType, intervalMs, payload?): string`

Creates a recurring event publish on a fixed interval. Returns a `scheduleId`.

```ts
const scheduleId = synkro.schedule("cleanup:run", 6 * 60 * 60 * 1000, { scope: "all" });
```

### `synkro.unschedule(scheduleId): boolean`

Cancels a scheduled recurring publish. Returns `true` if the schedule was found and cancelled.

```ts
synkro.unschedule(scheduleId);
```

### `synkro.getWorkflowGraph(workflowName): WorkflowGraph | null`

Returns the workflow definition as a directed graph with nodes and edges, or `null` if the workflow is not registered.

```ts
const graph = synkro.getWorkflowGraph("ProcessOrder");
// { workflowName: "ProcessOrder", nodes: [...], edges: [...] }
```

### `synkro.stop(): Promise<void>`

Gracefully shuts down. Clears all scheduled timers, waits for in-flight handlers to complete (up to `drainTimeout`), then disconnects the transport.

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
  dependsOn?: string[]; // run after all listed steps complete
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
  completedSteps?: string[];  // parallel workflows only
  activeSteps?: string[];     // parallel workflows only
  parallel?: boolean;         // true for parallel workflows
};

type MiddlewareCtx<T = unknown> = HandlerCtx<T> & {
  eventType: string;
};

type MiddlewareFunction = (
  ctx: MiddlewareCtx,
  next: () => Promise<void>,
) => Promise<void>;

type ScheduleInfo = {
  scheduleId: string;
  eventType: string;
  intervalMs: number;
  payload?: unknown;
  createdAt: string;
};

type WorkflowGraph = {
  workflowName: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

type WorkflowGraphNode = {
  id: string;
  type: "step";
  label: string;
  meta?: { retry?: RetryConfig; timeoutMs?: number };
};

type WorkflowGraphEdge = {
  from: string;
  to: string;
  label: "next" | "onSuccess" | "onFailure";
};
```

## License

MIT
