import { Synkro, type SynkroEvent, type SynkroWorkflow } from "@synkro/core";

import { handleNotifyCustomer } from "../handlers/notification.handler";
import { OrderEventHandler } from "../handlers/order-event.handler";
import { OrderWorkflowHandler } from "../handlers/order-workflow.handler";
import { ShipmentWorkflowHandler } from "../handlers/shipment-workflow.handler";
import { EventTypes, WorkflowTypes } from "./event-types";

let synkro: Synkro | null = null;

// Inline event handlers (traditional approach — still supported)
const events: SynkroEvent[] = [
  {
    type: EventTypes.NotifyCustomer,
    handler: async ({ requestId }) => {
      console.log(
        `[Event Handler] - Handling NotifyCustomer for request ${requestId}`,
      );
    },
  },
];

// Workflow definitions — handlers come from decorated classes via `handlers` option
const workflows: SynkroWorkflow[] = [
  {
    name: WorkflowTypes.ProcessOrder,
    onSuccess: WorkflowTypes.StartShipment,
    onComplete: WorkflowTypes.NotifyCustomer,
    steps: [
      {
        type: EventTypes.StockUpdate,
      },
      {
        type: EventTypes.PaymentRequested,
        retry: { maxRetries: 3 },
        onSuccess: EventTypes.PaymentCompleted,
        onFailure: EventTypes.PaymentFailed,
      },
      {
        type: EventTypes.PaymentCompleted,
      },
      {
        type: EventTypes.PaymentFailed,
      },
    ],
  },
  {
    name: WorkflowTypes.StartShipment,
    onComplete: WorkflowTypes.NotifyCustomer,
    steps: [
      {
        type: EventTypes.ShippingRequested,
      },
    ],
  },
  {
    name: WorkflowTypes.NotifyCustomer,
    steps: [
      {
        type: EventTypes.NotifyCustomer,
        handler: handleNotifyCustomer,
      },
    ],
  },
];

export async function eventManagerSetup(): Promise<Synkro> {
  if (synkro) return synkro;

  synkro = await Synkro.start({
    transport: "redis",
    connectionUrl: process.env.REDIS_URL! || "redis://localhost:6379",
    debug: true,
    events,
    workflows,
    // Decorator-based handlers — classes with @OnEvent and @OnWorkflowStep
    handlers: [
      new OrderEventHandler(),
      new OrderWorkflowHandler(),
      new ShipmentWorkflowHandler(),
    ],
  });

  return synkro;
}
