import { OnWorkflowStep, type HandlerCtx } from "@orko/core";

import { db } from "../db";

export class OrderWorkflowHandler {
  // @OnWorkflowStep("ProcessOrder", "StockUpdate")
  // async handleStockUpdate(ctx: HandlerCtx) {
  //   const { productId, quantity } = ctx.payload as {
  //     productId: string;
  //     quantity: number;
  //   };

  //   console.log(
  //     `Stock update for product: ${productId}, quantity: ${quantity}`,
  //   );
  //   await new Promise((resolve) => setTimeout(resolve, 2000));

  //   db.updateProductStock(productId, quantity);

  //   ctx.setPayload({
  //     productId,
  //     quantity,
  //     appendedData: "Stock update successful",
  //   });

  //   await ctx.publish("IndependentEvent", { productId, quantity });
  // }

  @OnWorkflowStep("ProcessOrder", "PaymentRequested")
  async handlePaymentRequested(ctx: HandlerCtx) {
    const { orderId, amount } = ctx.payload as {
      orderId: string;
      amount: number;
    };

    console.log(`Payment requested for order: ${orderId}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    db.insertPayment({
      orderId,
      amount: String(amount),
      status: "pending",
    });

    db.updateOrderStatus(orderId, "processing");
  }

  @OnWorkflowStep("ProcessOrder", "PaymentCompleted")
  async handlePaymentCompleted(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };

    console.log(`Payment completed for order: ${orderId}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    db.updatePaymentStatusByOrderId(orderId, "completed");
    db.updateOrderStatus(orderId, "payment_completed");
  }

  @OnWorkflowStep("ProcessOrder", "PaymentFailed")
  async handlePaymentFailed(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };

    console.log(`Payment failed for order: ${orderId}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    db.updatePaymentStatusByOrderId(orderId, "failed");
    db.updateOrderStatus(orderId, "payment_failed");
  }
}
