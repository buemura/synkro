<p align="center">
  <img src="./assets/mascot.svg" alt="Synkro" width="400" />
</p>

<h1 align="center">Synkro</h1>
<p align="center">
  <strong>Lightweight event-driven workflow orchestrator for Node.js</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@synkro/core"><img src="https://img.shields.io/npm/v/@synkro/core?label=%40synkro%2Fcore&color=6366f1" alt="npm @synkro/core" /></a>
  <a href="https://www.npmjs.com/package/@synkro/ui"><img src="https://img.shields.io/npm/v/@synkro/ui?label=%40synkro%2Fui&color=8b5cf6" alt="npm @synkro/ui" /></a>
  <a href="https://www.npmjs.com/package/@synkro/nestjs"><img src="https://img.shields.io/npm/v/@synkro/nestjs?label=%40synkro%2Fnestjs&color=a78bfa" alt="npm @synkro/nestjs" /></a>
</p>

<p align="center">
  <a href="https://github.com/buemura/synkro/actions/workflows/ci.yml"><img src="https://github.com/buemura/synkro/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI" /></a>
  <a href="https://github.com/buemura/synkro/blob/master/LICENSE"><img src="https://img.shields.io/github/license/buemura/synkro?color=6366f1" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-8b5cf6" alt="Node.js >= 18" />
  <a href="https://www.npmjs.com/package/@synkro/core"><img src="https://img.shields.io/npm/dm/@synkro/core?color=a78bfa" alt="Downloads" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-6366f1" alt="TypeScript" />
</p>

<br />

Define standalone events and multi-step workflows with conditional branching, retries, and chaining — all via simple configuration.

![Dashboard](./packages/ui/docs/dashboard-screenshot.png)

---

## Features

- **Standalone Events** — Simple pub/sub event handlers with optional retries
- **Sequential Workflows** — Multi-step workflows with automatic state persistence
- **Conditional Branching** — Route to different steps based on success or failure
- **Workflow Chaining** — Trigger follow-up workflows on completion, success, or failure
- **Retry Support** — Configurable retry logic per event or workflow step
- **Schema Validation** — Validate payloads at publish time and handler dispatch with any validation library
- **Workflow Timeout** — Step-level and workflow-level timeouts with automatic failure routing
- **Graceful Shutdown** — Drain active handlers before disconnecting with configurable timeout
- **Transport Options** — Redis for production, in-memory for development and testing
- **Dashboard UI** — Built-in web dashboard to visualize events, workflows, and message metrics
- **TypeScript** — Full type support out of the box

## Packages

| Package                             | Description                                           | Version                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [@synkro/core](./packages/core)     | Core orchestrator with Redis and in-memory transports | [![npm](https://img.shields.io/npm/v/@synkro/core?color=6366f1&label=)](https://www.npmjs.com/package/@synkro/core)     |
| [@synkro/ui](./packages/ui)         | Web dashboard for visualizing events and workflows    | [![npm](https://img.shields.io/npm/v/@synkro/ui?color=8b5cf6&label=)](https://www.npmjs.com/package/@synkro/ui)         |
| [@synkro/nestjs](./packages/nestjs) | NestJS integration module                             | [![npm](https://img.shields.io/npm/v/@synkro/nestjs?color=a78bfa&label=)](https://www.npmjs.com/package/@synkro/nestjs) |
| [@synkro/next](./packages/nextjs)   | Next.js integration                                   | [![npm](https://img.shields.io/npm/v/@synkro/next?color=c4b5fd&label=)](https://www.npmjs.com/package/@synkro/next)     |

## Quick Start

```bash
npm install @synkro/core
```

```ts
import { Synkro } from "@synkro/core";
import { z } from "zod"; // or any validation library

const synkro = await Synkro.start({
  transport: "redis",
  connectionUrl: "redis://localhost:6379",
  drainTimeout: 5000, // graceful shutdown: wait up to 5s for active handlers
  schemas: {
    // global schema validation — throws at publish time
    UserSignedUp: (payload) => z.object({ email: z.string() }).parse(payload),
  },
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
      timeoutMs: 30_000, // workflow-level timeout
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
          timeoutMs: 10_000, // step-level timeout override
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

// graceful shutdown — drains active handlers before disconnecting
await synkro.stop();
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

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

```bash
# Clone and install
git clone https://github.com/buemura/synkro.git
cd synkro
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm type-check
```

## License

[ISC](./LICENSE) © [buemura](https://github.com/buemura)
