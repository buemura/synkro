import type { HandlerCtx } from "@orko/core";

export const orderCreatedHandler = async ({
  requestId,
  payload,
}: HandlerCtx) => {
  console.log(`[Event] order.created - requestId: ${requestId}`, payload);
};
