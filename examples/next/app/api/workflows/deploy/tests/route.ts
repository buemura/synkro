import type { HandlerCtx } from "@synkro/core";
import { createWorkflowStepHandler } from "@synkro/next";

import { delay } from "@/lib/delay";
import { synkro } from "@/lib/synkro";

export const POST = createWorkflowStepHandler(synkro.client, {
  workflowName: "DeployService",
  stepType: "RunTests",
  transport: synkro.transport,
  advancer: synkro.advancer,
  secret: process.env.SYNKRO_SECRET,
  handler: async (ctx: HandlerCtx) => {
    const { service, shouldFail } = ctx.payload as {
      service: string;
      shouldFail?: boolean;
    };
    await delay(700);
    if (shouldFail) {
      throw new Error(`Tests failed for ${service}`);
    }
    console.log(
      `  [Tests] (${ctx.requestId}) All tests passed for ${service}`,
    );
  },
});
