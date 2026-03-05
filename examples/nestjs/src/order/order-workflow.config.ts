import type { SynkroWorkflow } from "@synkro/core";
import { OrderEvent, OrderWorkflow } from "./order.events.js";

// Handler stubs — replaced at runtime by @OnWorkflowStep decorated methods
const noop = async () => {};

export const orderWorkflows: SynkroWorkflow[] = [
  {
    name: OrderWorkflow.ProcessOrder,
    onSuccess: OrderWorkflow.StartShipment,
    steps: [
      { type: OrderEvent.StockUpdate, handler: noop },
      {
        type: OrderEvent.PaymentRequested,
        handler: noop,
        retry: { maxRetries: 3 },
        onSuccess: OrderEvent.PaymentCompleted,
        onFailure: OrderEvent.PaymentFailed,
      },
      { type: OrderEvent.PaymentCompleted, handler: noop },
      { type: OrderEvent.PaymentFailed, handler: noop },
    ],
  },
  {
    name: OrderWorkflow.StartShipment,
    steps: [{ type: OrderEvent.ShippingRequested, handler: noop }],
  },
];
