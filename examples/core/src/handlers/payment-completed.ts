import { HandlerCtx } from "@synkro/core";

import { db } from "../db";

export async function paymentCompletedHandler(ctx: HandlerCtx) {
  const { orderId } = ctx.payload as { orderId: string };

  console.log(`Payment completed for order: ${orderId}`);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  db.updatePaymentStatusByOrderId(orderId, "completed");
  db.updateOrderStatus(orderId, "payment_completed");
}
