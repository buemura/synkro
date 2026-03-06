import { createDashboardHandler, createSynkro } from "@synkro/nextjs";

import { confirmOrderHandler } from "@/handlers/confirm-order.handler";
import { orderCreatedHandler } from "@/handlers/order-created.handler";
import { processPaymentHandler } from "@/handlers/process-payment.handler";
import { validateOrderHandler } from "@/handlers/validate-order.handler";

export const synkro = createSynkro({
  transport: "redis",
  connectionUrl: process.env.REDIS_URL || "redis://localhost:6379",
  debug: true,
  events: [
    {
      type: "order.created",
      handler: orderCreatedHandler,
    },
  ],
  workflows: [
    {
      name: "ProcessOrder",
      steps: [
        {
          type: "ValidateOrder",
          handler: validateOrderHandler,
        },
        {
          type: "ProcessPayment",
          retry: { maxRetries: 3 },
          handler: processPaymentHandler,
        },
        {
          type: "ConfirmOrder",
          handler: confirmOrderHandler,
        },
      ],
    },
  ],
});

export const dashboardHandler = createDashboardHandler(synkro, {
  basePath: "/synkro",
});
