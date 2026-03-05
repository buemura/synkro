import type { SynkroWorkflow } from "@synkro/core";
import { OrderEvent, OrderWorkflow } from "./order.events.js";

// Handler stubs — replaced at runtime by @OnWorkflowStep decorated methods

export const orderWorkflows: SynkroWorkflow[] = [
  {
    name: OrderWorkflow.ProcessOrder,
    onSuccess: OrderWorkflow.StartShipment,
    steps: [
      { type: OrderEvent.StockUpdate },
      {
        type: OrderEvent.PaymentRequested,
        onSuccess: OrderEvent.PaymentCompleted,
        onFailure: OrderEvent.PaymentFailed,
        retry: { maxRetries: 3 },
      },
      { type: OrderEvent.PaymentCompleted },
      { type: OrderEvent.PaymentFailed },
    ],
  },
  {
    name: OrderWorkflow.StartShipment,
    steps: [{ type: OrderEvent.ShippingRequested }],
  },
];
