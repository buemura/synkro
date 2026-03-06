# @orko/nestjs

NestJS integration module for [@orko/core](https://www.npmjs.com/package/@orko/core).

## Installation

```bash
npm install @orko/nestjs @orko/core
```

## Quick Start

### 1. Register the module

```typescript
import { Module } from "@nestjs/common";
import { OrkoModule } from "@orko/nestjs";

@Module({
  imports: [
    OrkoModule.forRoot({
      transport: "in-memory",
    }),
  ],
})
export class AppModule {}
```

For async configuration (e.g. using `ConfigService`):

```typescript
OrkoModule.forRootAsync({
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
import { OnEvent } from "@orko/nestjs";
import type { HandlerCtx } from "@orko/core";

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
import type { OrkoWorkflow } from "@orko/core";

const noop = async () => {};

export const workflows: OrkoWorkflow[] = [
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
import { OnWorkflowStep } from "@orko/nestjs";
import type { HandlerCtx } from "@orko/core";

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
OrkoModule.forRoot({
  transport: "in-memory",
  workflows,
});
```

### 4. Publish events

Inject `OrkoService` to publish events or start workflows:

```typescript
import { Controller, Post, Body } from "@nestjs/common";
import { OrkoService } from "@orko/nestjs";

@Controller("orders")
export class OrderController {
  constructor(private readonly orko: OrkoService) {}

  @Post()
  async create(@Body() body: { productId: string }) {
    await this.orko.publish("ProcessOrder", body);
    return { status: "processing" };
  }
}
```

## API

### `OrkoModule`

| Method | Description |
|---|---|
| `forRoot(options)` | Register with static configuration |
| `forRootAsync(options)` | Register with async configuration (useFactory) |

### `OrkoService`

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
