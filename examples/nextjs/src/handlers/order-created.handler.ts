import type { HandlerCtx } from "@synkro/core";

export const orderCreatedHandler = async ({
  requestId,
  payload,
}: HandlerCtx) => {
  console.log(`[Event] order.created - requestId: ${requestId}`, payload);
};
