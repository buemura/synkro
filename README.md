# Synkro

Lightweight event-driven workflow orchestrator for Node.js. Define standalone events and multi-step workflows with conditional branching, retries, and chaining — all via simple configuration.

![Dashboard](./packages/ui/docs/dashboard-screenshot.png)

## Features

- **Standalone Events** — Simple pub/sub event handlers with optional retries
- **Sequential Workflows** — Multi-step workflows with automatic state persistence
- **Conditional Branching** — Route to different steps based on success or failure
- **Workflow Chaining** — Trigger follow-up workflows on completion, success, or failure
- **Retry Support** — Configurable retry logic per event or workflow step
- **Transport Options** — Redis for production, in-memory for development and testing
- **Dashboard UI** — Built-in web dashboard to visualize events, workflows, and message metrics
- **TypeScript** — Full type support out of the box

## Packages

| Package                           | Description                                           | Version |
| --------------------------------- | ----------------------------------------------------- | ------- |
| [@synkro/core](./packages/core)     | Core orchestrator with Redis and in-memory transports | [0.13.0](./release/v0.13.0.md)  |
| [@synkro/ui](./packages/ui)         | Web dashboard for visualizing events and workflows    | [0.2.1](./release)              |
| [@synkro/nestjs](./packages/nestjs) | NestJS integration module                             | [0.4.4](./release)              |
| [@synkro/next](./packages/nextjs)   | Next.js integration                                   | [0.1.1](./release)              |

## Quick Start

```bash
npm install @synkro/core
```

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
  workflows: [
    {
      name: "ProcessOrder",
      onSuccess: "StartShipment",
      steps: [
        {
          type: "ValidateStock",
          handler: async (ctx) => {
            console.log("Checking stock for order:", ctx.requestId);
          },
        },
        {
          type: "ProcessPayment",
          handler: paymentHandler,
          retry: { maxRetries: 3 },
          onSuccess: "PaymentCompleted",
          onFailure: "PaymentFailed",
        },
        { type: "PaymentCompleted", handler: completedHandler },
        { type: "PaymentFailed", handler: failedHandler },
        { type: "SendConfirmation", handler: confirmHandler },
      ],
    },
  ],
});

await synkro.publish("UserSignedUp", { email: "user@example.com" });
await synkro.publish("ProcessOrder", { orderId: "abc-123", amount: 49.99 });
```

## Dashboard

Install `@synkro/ui` and mount it on any HTTP endpoint to get a real-time dashboard.

```bash
npm install @synkro/ui
```

```ts
import express from "express";
import { createDashboardHandler } from "@synkro/ui";

const app = express();
app.use("/synkro", createDashboardHandler(synkro, { basePath: "/synkro" }));
app.listen(3000);
// Dashboard at http://localhost:3000/synkro
```

### Event Metrics

Click any event to see received, completed, and failed message counts (persisted via Redis).

![Event Detail](./packages/ui/docs/event-detail-screenshot.png)

### Workflow Visualization

Click any workflow to see a branching flow diagram with SVG connectors and a detailed steps table.

![Workflow Detail](./packages/ui/docs/workflow-detail-screenshot.png)

## Documentation

- **[@synkro/core](./packages/core)** — Full API reference, workflow configuration, conditional routing, chaining, and retry
- **[@synkro/ui](./packages/ui)** — Dashboard setup, served routes, and configuration options
- **[@synkro/nestjs](./packages/nestjs)** — NestJS module registration and usage
- **[@synkro/next](./packages/nextjs)** — Next.js integration with route handlers and dashboard
- **[Examples](./examples)** — Working examples with Express, NestJS, and Next.js

## License

ISC
