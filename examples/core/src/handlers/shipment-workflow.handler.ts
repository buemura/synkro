import { OnWorkflowStep, type HandlerCtx } from "@synkro/core";

import { db } from "../db";
import { EventTypes, WorkflowTypes } from "../events/event-types";

export class ShipmentWorkflowHandler {
  @OnWorkflowStep(WorkflowTypes.StartShipment, EventTypes.ShippingRequested)
  async handleShippingRequested(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };

    console.log(
      `[ShipmentWorkflowHandler.handleShippingRequested] - Shipping requested for request: ${ctx.requestId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    db.insertShipping({
      orderId,
      status: "pending",
    });

    db.updateOrderStatus(orderId, "shipping_requested");
  }
}
