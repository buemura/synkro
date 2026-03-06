# @orko/nextjs

Next.js integration for [@orko/core](https://www.npmjs.com/package/@orko/core).

## Installation

```bash
npm install @orko/nextjs @orko/core @orko/ui
```

## Quick Start

### 1. Create the orko instance

```typescript
// lib/orko.ts
import { createOrko, createDashboardHandler } from "@orko/nextjs";

export const orko = createOrko({
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
        { type: "ProcessPayment", handler: processPaymentHandler, retry: { maxRetries: 3 } },
        { type: "ConfirmOrder", handler: confirmOrderHandler },
      ],
    },
  ],
});

export const dashboardHandler = createDashboardHandler(orko, {
  basePath: "/orko",
});
```

The instance is lazily initialized on the first call and cached as a singleton across requests. In development, the singleton is stored on `globalThis` to survive Next.js HMR.

### 2. Publish events from route handlers

```typescript
// app/api/orders/route.ts
import { orko } from "@/lib/orko";

export async function POST(request: Request) {
  const body = await request.json();
  const requestId = await orko.publish("ProcessOrder", body);
  return Response.json({ requestId }, { status: 201 });
}
```

### 3. Mount the dashboard

```typescript
// app/orko/[[...path]]/route.ts
import { dashboardHandler } from "@/lib/orko";

export { dashboardHandler as GET };
```

The dashboard is now available at `/orko`.

### 4. Define handlers in separate files

```typescript
// handlers/validate-order.handler.ts
import type { HandlerCtx } from "@orko/core";

export const validateOrderHandler = async ({ requestId, payload }: HandlerCtx) => {
  console.log(`Validating order ${requestId}...`, payload);
};
```

## API

### `createOrko(options)`

Creates a lazy-initializing orko client. Accepts the same options as `Orko.start()` from `@orko/core`.

Returns a `OrkoClient` with the following methods:

| Method | Description |
|---|---|
| `publish(event, payload?, requestId?)` | Publish an event or start a workflow |
| `on(eventType, handler, retry?)` | Register an event handler at runtime |
| `introspect()` | Get metadata about registered events and workflows |
| `getEventMetrics(eventType)` | Get received/completed/failed counts for an event |
| `getInstance()` | Get the underlying `Orko` instance |
| `stop()` | Disconnect and clean up |

### `createDashboardHandler(orko, options?)`

Creates a Next.js route handler for the `@orko/ui` dashboard.

| Option | Type | Default | Description |
|---|---|---|---|
| `basePath` | `string` | `"/"` | URL path prefix where the dashboard is mounted |

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
