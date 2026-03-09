import type { HandlerCtx } from "@synkro/core";
import { createWorkflowStepHandler } from "@synkro/next";

import { delay } from "@/lib/delay";
import { synkro } from "@/lib/synkro";

export const POST = createWorkflowStepHandler(synkro.client, {
  workflowName: "DeployService",
  stepType: "DeployToProduction",
  transport: synkro.transport,
  advancer: synkro.advancer,
  secret: process.env.SYNKRO_SECRET,
  handler: async (ctx: HandlerCtx) => {
    const { service, version } = ctx.payload as {
      service: string;
      version: string;
    };
    await delay(500);
    console.log(
      `  [Deploy] (${ctx.requestId}) Deployed ${service}@${version} to production`,
    );
  },
});
