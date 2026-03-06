import type { HandlerCtx } from "@synkro/core";

import { updateOrderStatus } from "@/lib/orders";

export const processPaymentHandler = async ({
  requestId,
  payload,
}: HandlerCtx) => {
  console.log(`[Workflow] Processing payment...`, payload);
  updateOrderStatus(requestId, "payment_processing");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  updateOrderStatus(requestId, "payment_completed");
  console.log(`[Workflow] Payment processed`);
};
