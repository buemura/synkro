import { OnEvent, type HandlerCtx } from "@synkro/core";

export class OrderEventHandler {
  @OnEvent("OrderCreated", { maxRetries: 3 })
  async handleOrderCreated({ requestId }: HandlerCtx) {
    console.log(
      `[Event Handler] - Handling OrderCreated for request ${requestId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  @OnEvent("StockUpdate", { maxRetries: 2 })
  async handleStockUpdate({ requestId }: HandlerCtx) {
    console.log(
      `[Event Handler] - Handling StockUpdate for request ${requestId}`,
    );
    throw new Error("Simulated failure in StockUpdate handler");
  }

  @OnEvent("IndependentEvent", { maxRetries: 2 })
  async handleIndependentEvent({ requestId }: HandlerCtx) {
    console.log(
      `[Event Handler] - Handling IndependentEvent for request ${requestId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
