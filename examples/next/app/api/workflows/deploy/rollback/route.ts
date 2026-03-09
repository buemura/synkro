import type { HandlerCtx } from "@synkro/core";
import { createWorkflowStepHandler } from "@synkro/next";

import { delay } from "@/lib/delay";
import { synkro } from "@/lib/synkro";

export const POST = createWorkflowStepHandler(synkro.client, {
  workflowName: "DeployService",
  stepType: "Rollback",
  transport: synkro.transport,
  advancer: synkro.advancer,
  secret: process.env.SYNKRO_SECRET,
  handler: async (ctx: HandlerCtx) => {
    const { service } = ctx.payload as { service: string };
    await delay(400);
    console.log(
      `  [Rollback] (${ctx.requestId}) Rolling back ${service} to previous version`,
    );
  },
});
