import { OnWorkflowStep, type HandlerCtx } from "@synkro/core";

import { db } from "../db";
import { EventTypes, WorkflowTypes } from "../events/event-types";

export class OrderWorkflowHandler {
  @OnWorkflowStep(WorkflowTypes.ProcessOrder, EventTypes.StockUpdate)
  async handleStockUpdate(ctx: HandlerCtx) {
    const { productId, quantity } = ctx.payload as {
      productId: string;
      quantity: number;
    };

    console.log(
      `[OrderWorkflowHandler.handleStockUpdate] - Stock update for request: ${ctx.requestId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    db.updateProductStock(productId, quantity);

    ctx.setPayload({
      productId,
      quantity,
      appendedData: "Stock update successful",
    });
  }

  @OnWorkflowStep(WorkflowTypes.ProcessOrder, EventTypes.PaymentRequested)
  async handlePaymentRequested(ctx: HandlerCtx) {
    const { orderId, amount } = ctx.payload as {
      orderId: string;
      amount: number;
    };

    console.log(
      `[OrderWorkflowHandler.handlePaymentRequested] - Payment requested for request: ${ctx.requestId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    db.insertPayment({
      orderId,
      amount: String(amount),
      status: "pending",
    });

    db.updateOrderStatus(orderId, "processing");
  }

  @OnWorkflowStep(WorkflowTypes.ProcessOrder, EventTypes.PaymentCompleted)
  async handlePaymentCompleted(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };

    console.log(
      `[OrderWorkflowHandler.handlePaymentCompleted] - Payment completed for request: ${ctx.requestId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    db.updatePaymentStatusByOrderId(orderId, "completed");
    db.updateOrderStatus(orderId, "payment_completed");
  }

  @OnWorkflowStep(WorkflowTypes.ProcessOrder, EventTypes.PaymentFailed)
  async handlePaymentFailed(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };

    console.log(
      `[OrderWorkflowHandler.handlePaymentFailed] - Payment failed for request: ${ctx.requestId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    db.updatePaymentStatusByOrderId(orderId, "failed");
    db.updateOrderStatus(orderId, "payment_failed");
  }
}
