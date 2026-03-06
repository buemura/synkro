import type { SynkroClient } from "./synkro.js";
import type { DashboardHandlerOptions } from "./types.js";

export function createDashboardHandler(
  synkro: SynkroClient,
  options?: DashboardHandlerOptions,
): (request: Request) => Promise<Response> {
  const basePath = normalizeBasePath(options?.basePath ?? "/");

  return async (request: Request) => {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const path = basePath ? url.pathname.replace(basePath, "") || "/" : url.pathname;

    if (path === "/" || path === "") {
      const { getDashboardHtml } = await import("@synkro/ui");
      return new Response(getDashboardHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/api/introspection") {
      const data = await synkro.introspect();
      return Response.json(data);
    }

    const eventMetricsMatch = path.match(/^\/api\/events\/(.+)$/);
    if (eventMetricsMatch?.[1]) {
      const eventType = decodeURIComponent(eventMetricsMatch[1]);
      const data = await synkro.getEventMetrics(eventType);
      return Response.json(data);
    }

    return new Response("Not Found", { status: 404 });
  };
}

function normalizeBasePath(path: string): string {
  const normalized = "/" + path.replace(/^\/+|\/+$/g, "");
  return normalized === "/" ? "" : normalized;
}
