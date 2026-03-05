import { Injectable } from "@nestjs/common";
import { OnWorkflowStep } from "@synkro/nestjs";
import type { HandlerCtx } from "@synkro/core";
import { OrderEvent, OrderWorkflow } from "./order.events.js";
import { OrderService } from "./order.service.js";

@Injectable()
export class OrderWorkflowHandler {
  constructor(private readonly orderService: OrderService) {}

  @OnWorkflowStep(OrderWorkflow.ProcessOrder, OrderEvent.StockUpdate)
  async handleStockUpdate(ctx: HandlerCtx): Promise<void> {
    const { productId, quantity } = ctx.payload as {
      productId: string;
      quantity: number;
    };
    console.log(`[StockUpdate] product=${productId} qty=${quantity}`);
    ctx.setPayload({ productId, quantity, stockUpdated: true });
  }

  @OnWorkflowStep(OrderWorkflow.ProcessOrder, OrderEvent.PaymentRequested)
  async handlePaymentRequested(ctx: HandlerCtx): Promise<void> {
    const { orderId, amount } = ctx.payload as {
      orderId: string;
      amount: number;
    };
    console.log(`[PaymentRequested] order=${orderId} amount=${amount}`);
    this.orderService.updateStatus(orderId, "processing");
  }

  @OnWorkflowStep(OrderWorkflow.ProcessOrder, OrderEvent.PaymentCompleted)
  async handlePaymentCompleted(ctx: HandlerCtx): Promise<void> {
    const { orderId } = ctx.payload as { orderId: string };
    console.log(`[PaymentCompleted] order=${orderId}`);
    this.orderService.updateStatus(orderId, "paid");
  }

  @OnWorkflowStep(OrderWorkflow.ProcessOrder, OrderEvent.PaymentFailed)
  async handlePaymentFailed(ctx: HandlerCtx): Promise<void> {
    const { orderId } = ctx.payload as { orderId: string };
    console.log(`[PaymentFailed] order=${orderId}`);
    this.orderService.updateStatus(orderId, "payment_failed");
  }

  @OnWorkflowStep(OrderWorkflow.StartShipment, OrderEvent.ShippingRequested)
  async handleShippingRequested(ctx: HandlerCtx): Promise<void> {
    const { orderId } = ctx.payload as { orderId: string };
    console.log(`[ShippingRequested] order=${orderId}`);
    this.orderService.updateStatus(orderId, "shipped");
  }
}
