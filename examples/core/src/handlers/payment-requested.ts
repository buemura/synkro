import { HandlerCtx } from "@orko/core";

import { db } from "../db";

export async function paymentRequestedHandler(ctx: HandlerCtx) {
  const { orderId, amount } = ctx.payload as {
    orderId: string;
    amount: number;
  };

  console.log(`Payment requested for order: ${orderId}`);

  // throw new Error("Simulated failure in PaymentRequested handler");

  await new Promise((resolve) => setTimeout(resolve, 2000));

  db.insertPayment({
    orderId,
    amount: String(amount),
    status: "pending",
  });

  db.updateOrderStatus(orderId, "processing");
}
