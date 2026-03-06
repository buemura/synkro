# @synkro/next

Next.js integration for [@synkro/core](https://www.npmjs.com/package/@synkro/core).

## Installation

```bash
npm install @synkro/next @synkro/core @synkro/ui
```

## Quick Start

### 1. Create the synkro instance

```typescript
// lib/synkro.ts
import { createSynkro, createDashboardHandler } from "@synkro/next";

export const synkro = createSynkro({
  transport: "redis",
  connectionUrl: process.env.REDIS_URL || "redis://localhost:6379",
  events: [
    {
      type: "order.created",
      handler: async ({ requestId, payload }) => {
        console.log(`Order created: ${requestId}`, payload);
      },
    },
  ],
  workflows: [
    {
      name: "ProcessOrder",
      steps: [
        { type: "ValidateOrder", handler: validateOrderHandler },
        {
          type: "ProcessPayment",
          handler: processPaymentHandler,
          retry: { maxRetries: 3 },
        },
        { type: "ConfirmOrder", handler: confirmOrderHandler },
      ],
    },
  ],
});

export const dashboardHandler = createDashboardHandler(synkro, {
  basePath: "/synkro",
});
```

The instance is lazily initialized on the first call and cached as a singleton across requests. In development, the singleton is stored on `globalThis` to survive Next.js HMR.

### 2. Publish events from route handlers

```typescript
// app/api/orders/route.ts
import { synkro } from "@/lib/synkro";

export async function POST(request: Request) {
  const body = await request.json();
  const requestId = await synkro.publish("ProcessOrder", body);
  return Response.json({ requestId }, { status: 201 });
}
```

### 3. Mount the dashboard

```typescript
// app/synkro/[[...path]]/route.ts
import { dashboardHandler } from "@/lib/synkro";

export { dashboardHandler as GET };
```

The dashboard is now available at `/synkro`.

### 4. Define handlers in separate files

```typescript
// handlers/validate-order.handler.ts
import type { HandlerCtx } from "@synkro/core";

export const validateOrderHandler = async ({
  requestId,
  payload,
}: HandlerCtx) => {
  console.log(`Validating order ${requestId}...`, payload);
};
```

## API

### `createSynkro(options)`

Creates a lazy-initializing synkro client. Accepts the same options as `Synkro.start()` from `@synkro/core`.

Returns a `SynkroClient` with the following methods:

| Method                                 | Description                                        |
| -------------------------------------- | -------------------------------------------------- |
| `publish(event, payload?, requestId?)` | Publish an event or start a workflow               |
| `on(eventType, handler, retry?)`       | Register an event handler at runtime               |
| `introspect()`                         | Get metadata about registered events and workflows |
| `getEventMetrics(eventType)`           | Get received/completed/failed counts for an event  |
| `getInstance()`                        | Get the underlying `Synkro` instance                 |
| `stop()`                               | Disconnect and clean up                            |

### `createDashboardHandler(synkro, options?)`

Creates a Next.js route handler for the `@synkro/ui` dashboard.

| Option     | Type     | Default | Description                                    |
| ---------- | -------- | ------- | ---------------------------------------------- |
| `basePath` | `string` | `"/"`   | URL path prefix where the dashboard is mounted |

## Next.js Configuration

Add `ioredis` to `serverExternalPackages` in your Next.js config when using the Redis transport:

```typescript
// next.config.ts
const nextConfig = {
  serverExternalPackages: ["ioredis"],
};

export default nextConfig;
```

## License

ISC
