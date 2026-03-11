# @synkro/nestjs

NestJS integration module for [@synkro/core](https://www.npmjs.com/package/@synkro/core).

## Installation

```bash
npm install @synkro/nestjs @synkro/core
```

## Quick Start

### 1. Register the module

```typescript
import { Module } from "@nestjs/common";
import { SynkroModule } from "@synkro/nestjs";

@Module({
  imports: [
    SynkroModule.forRoot({
      transport: "in-memory",
    }),
  ],
})
export class AppModule {}
```

For async configuration (e.g. using `ConfigService`):

```typescript
SynkroModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    transport: "redis",
    connectionUrl: config.get("REDIS_URL"),
  }),
});
```

### 2. Define event handlers

Use the `@OnEvent` decorator to register standalone event handlers:

```typescript
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@synkro/nestjs";
import type { HandlerCtx } from "@synkro/core";

@Injectable()
export class NotificationHandler {
  @OnEvent("UserSignedUp", { maxRetries: 3 })
  async handleUserSignedUp(ctx: HandlerCtx) {
    const { email } = ctx.payload as { email: string };
    console.log(`Welcome email sent to ${email}`);
  }
}
```

### 3. Define workflows

Define workflow structure in a config file using the `NestSynkroWorkflow` type — step handlers are bound via `@OnWorkflowStep` decorators, so no inline handlers or noops are needed:

```typescript
import type { NestSynkroWorkflow } from "@synkro/nestjs";

export const workflows: NestSynkroWorkflow[] = [
  {
    name: "ProcessOrder",
    onSuccess: "StartShipment",
    steps: [
      { type: "ValidateStock" },
      {
        type: "ProcessPayment",
        retry: { maxRetries: 3 },
        onSuccess: "PaymentCompleted",
        onFailure: "PaymentFailed",
      },
      { type: "PaymentCompleted" },
      { type: "PaymentFailed" },
    ],
  },
];
```

Then bind handlers with `@OnWorkflowStep`:

```typescript
import { Injectable } from "@nestjs/common";
import { OnWorkflowStep } from "@synkro/nestjs";
import type { HandlerCtx } from "@synkro/core";

@Injectable()
export class OrderWorkflowHandler {
  @OnWorkflowStep("ProcessOrder", "ValidateStock")
  async handleValidateStock(ctx: HandlerCtx) {
    console.log("Validating stock...");
  }

  @OnWorkflowStep("ProcessOrder", "ProcessPayment")
  async handlePayment(ctx: HandlerCtx) {
    console.log("Processing payment...");
  }
}
```

Pass the workflow config when registering the module:

```typescript
SynkroModule.forRoot({
  transport: "in-memory",
  workflows,
});
```

> **Note:** Every workflow step must have a handler — either an inline `handler` function in the config or a matching `@OnWorkflowStep` decorator on a registered provider. The module will throw at startup if any step is missing a handler.

### 4. Publish events

Inject `SynkroService` to publish events or start workflows:

```typescript
import { Controller, Post, Body } from "@nestjs/common";
import { SynkroService } from "@synkro/nestjs";

@Controller("orders")
export class OrderController {
  constructor(private readonly synkro: SynkroService) {}

  @Post()
  async create(@Body() body: { productId: string }) {
    await this.synkro.publish("ProcessOrder", body);
    return { status: "processing" };
  }
}
```

### 5. Configure retention (optional)

Control Redis key TTLs for locks, deduplication, workflow state, and metrics:

```typescript
SynkroModule.forRoot({
  transport: "redis",
  connectionUrl: "redis://localhost:6379",
  retention: {
    lockTtl: 60,       // distributed lock TTL in seconds (default: 300)
    dedupTtl: 3600,    // deduplication key TTL in seconds (default: 86400)
    stateTtl: 7200,    // workflow state TTL in seconds (default: 86400)
    metricsTtl: 86400, // metrics key TTL in seconds (default: no expiry)
  },
});
```

## API

### `SynkroModule`

| Method | Description |
|---|---|
| `forRoot(options)` | Register with static configuration |
| `forRootAsync(options)` | Register with async configuration (useFactory) |

### `SynkroService`

| Method | Description |
|---|---|
| `publish(event, payload?, requestId?)` | Publish an event or start a workflow |
| `on(eventType, handler, retry?)` | Register an event handler at runtime |
| `introspect()` | Returns registered events and workflows |
| `getEventMetrics(eventType)` | Returns event metrics (received, completed, failed) |
| `getInstance()` | Access the underlying `Synkro` core instance |

### Decorators

| Decorator | Description |
|---|---|
| `@OnEvent(type, retry?)` | Register a method as a standalone event handler |
| `@OnWorkflowStep(workflow, step)` | Bind a method to a workflow step |

## License

MIT
