import type { HandlerCtx } from "@synkro/core";
import { createEventHandler } from "@synkro/next";

import { delay } from "@/lib/delay";
import { synkro } from "@/lib/synkro";

export const POST = createEventHandler(synkro.client, {
  eventType: "PaymentReceived",
  transport: synkro.transport,
  secret: process.env.SYNKRO_SECRET,
  retry: { maxRetries: 3, backoff: "exponential" },
  handler: async (ctx: HandlerCtx) => {
    const { orderId, amount } = ctx.payload as {
      orderId: string;
      amount: number;
    };
    await delay(500);
    console.log(
      `  [Receipt] (${ctx.requestId}) Issuing receipt for order ${orderId} — $${amount}`,
    );
  },
});
