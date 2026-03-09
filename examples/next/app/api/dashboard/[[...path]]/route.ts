import { createDashboardHandler } from "@synkro/next";

import { synkro } from "@/lib/synkro";

const handler = createDashboardHandler(synkro.client, {
  basePath: "/api/dashboard",
});

export const GET = handler;
