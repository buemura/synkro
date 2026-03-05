import { HandlerCtx } from "@synkro/core";

import { db } from "../../db";

export async function shippingRequestedHandler(ctx: HandlerCtx) {
  const { orderId } = ctx.payload as {
    orderId: string;
  };

  console.log(`Shipping requested for order: ${orderId}`);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  db.insertShipping({
    orderId,
    status: "pending",
  });

  db.updateOrderStatus(orderId, "shipping_requested");
}
