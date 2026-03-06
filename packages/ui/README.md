# @orko/ui

Dashboard UI for [@orko/core](https://github.com/buemura/orko). Mount it on any HTTP endpoint to visualize your registered events and workflows in real time.

## Screenshots

### Dashboard

Overview of all registered events and workflows with paginated tables.

![Dashboard](./docs/dashboard-screenshot.png)

### Event Detail

Click any event to view its message metrics — received, completed, and failed counts tracked via Redis.

![Event Detail](./docs/event-detail-screenshot.png)

### Workflow Detail

Click any workflow to see a branching flow diagram with SVG connectors (green for success, red for failure) and a detailed steps table.

![Workflow Detail](./docs/workflow-detail-screenshot.png)

## Features

- **Events overview** — Paginated table of all standalone events with retry configuration
- **Event detail** — Click an event to see received/completed/failed message counts (Redis-persisted)
- **Workflows overview** — Paginated table of all workflows with step counts and callback badges
- **Workflow detail** — Branching flow diagram with SVG bezier curves for onSuccess/onFailure paths, plus a detailed steps table
- **Stats at a glance** — Total counts for events, workflows, and workflow steps
- **Pagination** — 5 items per page with independent pagination for events and workflows
- **Framework-agnostic** — Works with Express, Fastify, raw Node.js HTTP, or any framework that supports `(IncomingMessage, ServerResponse)` handlers
- **Zero dependencies** — Self-contained HTML/CSS/JS dashboard with no external assets

## Installation

```bash
npm install @orko/ui
```

## Usage

```typescript
import { createDashboardHandler } from "@orko/ui";
import { Orko } from "@orko/core";

const orko = await Orko.start({
  transport: "redis",
  connectionUrl: "redis://localhost:6379",
  events: [/* ... */],
  workflows: [/* ... */],
});
```

### Express

```typescript
import express from "express";

const app = express();

app.use("/orko", createDashboardHandler(orko, { basePath: "/orko" }));

app.listen(3000);
// Dashboard available at http://localhost:3000/orko
```

### Raw Node.js HTTP

```typescript
import http from "node:http";

const server = http.createServer(createDashboardHandler(orko));

server.listen(3000);
// Dashboard available at http://localhost:3000
```

## API

### `createDashboardHandler(orko, options?)`

Returns a standard Node.js HTTP request handler `(IncomingMessage, ServerResponse) => void`.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `orko` | `Orko` | A started Orko instance |
| `options.basePath` | `string` | Base path where the dashboard is mounted (default: `"/"`) |

**Served routes (relative to basePath):**

| Route | Description |
|---|---|
| `GET /` | Dashboard HTML page |
| `GET /api/introspection` | JSON payload with all registered events and workflows |
| `GET /api/events/:type` | JSON payload with message metrics for a specific event |

## License

ISC
