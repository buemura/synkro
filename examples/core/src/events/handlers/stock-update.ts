import { HandlerCtx } from "@synkro/core";

import { db } from "../../db";

export async function stockUpdateHandler(ctx: HandlerCtx) {
  const { productId, quantity } = ctx.payload as {
    productId: string;
    quantity: number;
  };

  console.log(`Stock update for product: ${productId}, quantity: ${quantity}`);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  db.updateProductStock(productId, quantity);

  ctx.setPayload({
    productId,
    quantity,
    appendedData: "Stock update successful",
  });

  await ctx.publish("IndependentEvent", { productId, quantity });
}
