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
    redisUrl: config.get("REDIS_URL"),
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

Define workflow structure in a config file:

```typescript
import type { SynkroWorkflow } from "@synkro/core";

const noop = async () => {};

export const workflows: SynkroWorkflow[] = [
  {
    name: "ProcessOrder",
    onSuccess: "StartShipment",
    steps: [
      { type: "ValidateStock", handler: noop },
      {
        type: "ProcessPayment",
        handler: noop,
        retry: { maxRetries: 3 },
        onSuccess: "PaymentCompleted",
        onFailure: "PaymentFailed",
      },
      { type: "PaymentCompleted", handler: noop },
      { type: "PaymentFailed", handler: noop },
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

### Decorators

| Decorator | Description |
|---|---|
| `@OnEvent(type, retry?)` | Register a method as a standalone event handler |
| `@OnWorkflowStep(workflow, step)` | Bind a method to a workflow step |

## License

ISC
