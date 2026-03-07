import { OnEvent, type HandlerCtx } from "@synkro/core";
import { EventTypes } from "../events/event-types";

export class OrderEventHandler {
  @OnEvent(EventTypes.OrderCreated, { maxRetries: 3 })
  async handleOrderCreated({ requestId }: HandlerCtx) {
    console.log(
      `[Event Handler] - Handling OrderCreated for request ${requestId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  @OnEvent(EventTypes.StockUpdate, { maxRetries: 2 })
  async handleStockUpdate({ requestId }: HandlerCtx) {
    console.log(
      `[Event Handler] - Handling StockUpdate for request ${requestId}`,
    );
    throw new Error("Simulated failure in StockUpdate handler");
  }
}
