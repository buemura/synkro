import type { HandlerCtx } from "@synkro/core";
import { createWorkflowStepHandler } from "@synkro/next";

import { delay } from "@/lib/delay";
import { synkro } from "@/lib/synkro";

export const POST = createWorkflowStepHandler(synkro.client, {
  workflowName: "OrderProcessing",
  stepType: "ValidateOrder",
  transport: synkro.transport,
  advancer: synkro.advancer,
  secret: process.env.SYNKRO_SECRET,
  handler: async (ctx: HandlerCtx) => {
    const { orderId, items } = ctx.payload as {
      orderId: string;
      items: string[];
    };
    await delay(200);
    console.log(
      `  [Validate] (${ctx.requestId}) Order ${orderId} with ${items.length} item(s) is valid`,
    );
  },
});
