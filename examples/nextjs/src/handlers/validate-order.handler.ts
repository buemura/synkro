import { HandlerCtx } from "@synkro/core";

import { updateOrderStatus } from "@/lib/orders";

export const validateOrderHandler = async ({
  requestId,
  payload,
}: HandlerCtx) => {
  console.log(`[Workflow] Validating order...`, payload);
  updateOrderStatus(requestId, "validating");
  await new Promise((resolve) => setTimeout(resolve, 500));
  updateOrderStatus(requestId, "validated");
  console.log(`[Workflow] Order validated`);
};
