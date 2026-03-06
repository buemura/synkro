import { OnWorkflowStep, type HandlerCtx } from "@orko/core";

import { db } from "../db";

export class ShipmentWorkflowHandler {
  @OnWorkflowStep("StartShipment", "ShippingRequested")
  async handleShippingRequested(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };

    console.log(`Shipping requested for order: ${orderId}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    db.insertShipping({
      orderId,
      status: "pending",
    });

    db.updateOrderStatus(orderId, "shipping_requested");
  }

  @OnWorkflowStep("NotifyCustomer", "NotifyCustomer")
  async handleNotifyCustomer(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };

    console.log(
      `[Event Handler] - Handling NotifyCustomer for request ${ctx.requestId} order ${orderId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
