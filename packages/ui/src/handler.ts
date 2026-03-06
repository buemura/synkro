import type { IncomingMessage, ServerResponse } from "node:http";
import type { Orko } from "@orko/core";

import { getDashboardHtml } from "./dashboard.js";

export type DashboardOptions = {
  basePath?: string;
};

export function createDashboardHandler(
  orko: Orko,
  options?: DashboardOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const basePath = normalizeBasePath(options?.basePath ?? "/");

  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    const url = req.url ?? "/";
    const path = basePath ? url.replace(basePath, "") || "/" : url;

    if (path === "/" || path === "") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHtml());
      return;
    }

    if (path === "/api/introspection") {
      const data = orko.introspect();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }

    const eventMetricsMatch = path.match(/^\/api\/events\/(.+)$/);
    if (eventMetricsMatch?.[1]) {
      const eventType = decodeURIComponent(eventMetricsMatch[1]);
      orko
        .getEventMetrics(eventType)
        .then((data) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        })
        .catch(() => {
          res.writeHead(500);
          res.end("Internal Server Error");
        });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  };
}

function normalizeBasePath(path: string): string {
  const normalized = "/" + path.replace(/^\/+|\/+$/g, "");
  return normalized === "/" ? "" : normalized;
}
