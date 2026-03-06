import type { HandlerCtx } from "@orko/core";

import { updateOrderStatus } from "@/lib/orders";

export const confirmOrderHandler = async ({
  requestId,
  payload,
}: HandlerCtx) => {
  console.log(`[Workflow] Confirming order...`, payload);
  updateOrderStatus(requestId, "confirming");
  await new Promise((resolve) => setTimeout(resolve, 500));
  updateOrderStatus(requestId, "completed");
  console.log(`[Workflow] Order confirmed`);
};
