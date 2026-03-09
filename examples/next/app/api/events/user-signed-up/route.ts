import type { HandlerCtx } from "@synkro/core";
import { createEventHandler } from "@synkro/next";

import { delay } from "@/lib/delay";
import { synkro } from "@/lib/synkro";

export const POST = createEventHandler(synkro.client, {
  eventType: "UserSignedUp",
  transport: synkro.transport,
  secret: process.env.SYNKRO_SECRET,
  handler: async (ctx: HandlerCtx) => {
    const { email, name } = ctx.payload as { email: string; name: string };
    await delay(300);
    console.log(
      `  [Email] (${ctx.requestId}) Sending welcome email to ${name} <${email}>`,
    );
  },
});
