import { HandlerCtx } from "@synkro/core";

import { db } from "../db";

export async function paymentFailedHandler(ctx: HandlerCtx) {
  const { orderId } = ctx.payload as { orderId: string };

  console.log(`Payment failed for order: ${orderId}`);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  db.updatePaymentStatusByOrderId(orderId, "failed");
  db.updateOrderStatus(orderId, "payment_failed");
}
