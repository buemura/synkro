import type { HandlerCtx } from "@synkro/core";
import { createWorkflowStepHandler } from "@synkro/next";

import { delay } from "@/lib/delay";
import { synkro } from "@/lib/synkro";

export const POST = createWorkflowStepHandler(synkro.client, {
  workflowName: "OrderProcessing",
  stepType: "FulfillOrder",
  transport: synkro.transport,
  advancer: synkro.advancer,
  secret: process.env.SYNKRO_SECRET,
  handler: async (ctx: HandlerCtx) => {
    const { orderId } = ctx.payload as { orderId: string };
    await delay(400);
    console.log(
      `  [Fulfill] (${ctx.requestId}) Shipping order ${orderId}`,
    );
  },
});
