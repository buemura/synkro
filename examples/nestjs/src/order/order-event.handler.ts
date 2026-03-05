import { Injectable } from "@nestjs/common";
import { OnEvent } from "@synkro/nestjs";
import type { HandlerCtx } from "@synkro/core";
import { OrderEvent } from "./order.events.js";

@Injectable()
export class OrderEventHandler {
  @OnEvent(OrderEvent.OrderCreated, { maxRetries: 3 })
  async handleOrderCreated(ctx: HandlerCtx): Promise<void> {
    console.log(`[OrderCreated] requestId=${ctx.requestId}`, ctx.payload);
  }

  @OnEvent(OrderEvent.NotifyCustomer)
  async handleNotifyCustomer(ctx: HandlerCtx): Promise<void> {
    const { orderId } = ctx.payload as { orderId: string };
    console.log(
      `[NotifyCustomer] Notifying customer for order=${orderId}, requestId=${ctx.requestId}`,
    );
  }
}
