import { describe, expect, it, vi } from "vitest";

import { createDashboardHandler } from "./handler.js";
import type { SynkroClient } from "./synkro.js";

vi.mock("@synkro/ui", () => ({
  getDashboardHtml: () => "<html>dashboard</html>",
}));

function createMockClient(): SynkroClient {
  return {
    publish: vi.fn().mockResolvedValue("req-1"),
    on: vi.fn(),
    introspect: vi.fn().mockResolvedValue({ events: [], workflows: [] }),
    getEventMetrics: vi.fn().mockResolvedValue({
      type: "test",
      received: 5,
      completed: 3,
      failed: 2,
    }),
    getInstance: vi.fn(),
    stop: vi.fn(),
  };
}

describe("createDashboardHandler", () => {
  it("should return dashboard HTML at root path", async () => {
    const client = createMockClient();
    const handler = createDashboardHandler(client, { basePath: "/synkro" });

    const response = await handler(new Request("http://localhost/synkro"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    const body = await response.text();
    expect(body).toContain("dashboard");
  });

  it("should return introspection data", async () => {
    const client = createMockClient();
    const handler = createDashboardHandler(client, { basePath: "/synkro" });

    const response = await handler(
      new Request("http://localhost/synkro/api/introspection"),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ events: [], workflows: [] });
  });

  it("should return event metrics", async () => {
    const client = createMockClient();
    const handler = createDashboardHandler(client, { basePath: "/synkro" });

    const response = await handler(
      new Request("http://localhost/synkro/api/events/test"),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ type: "test", received: 5, completed: 3, failed: 2 });
  });

  it("should return 404 for unknown paths", async () => {
    const client = createMockClient();
    const handler = createDashboardHandler(client, { basePath: "/synkro" });

    const response = await handler(
      new Request("http://localhost/synkro/unknown"),
    );

    expect(response.status).toBe(404);
  });

  it("should return 405 for non-GET methods", async () => {
    const client = createMockClient();
    const handler = createDashboardHandler(client, { basePath: "/synkro" });

    const response = await handler(
      new Request("http://localhost/synkro", { method: "POST" }),
    );

    expect(response.status).toBe(405);
  });
});
