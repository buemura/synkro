import { Synkro, SynkroEvent, SynkroWorkflow } from "@synkro/core";

import { EventTypes, WorkflowTypes } from "./event-types";
import { paymentCompletedHandler } from "./handlers/payment-completed";
import { paymentFailedHandler } from "./handlers/payment-failed";
import { paymentRequestedHandler } from "./handlers/payment-requested";
import { shippingRequestedHandler } from "./handlers/shipping-requested";
import { stockUpdateHandler } from "./handlers/stock-update";

let synkro: Synkro | null = null;

const events: SynkroEvent[] = [
  {
    type: EventTypes.OrderCreated,
    handler: async ({ requestId, payload }) => {
      console.log(
        `[Event Handler] - Handling OrderCreated for request ${requestId}`,
      );
      // Simulate some processing logic
      await new Promise((resolve) => setTimeout(resolve, 100));
    },
    retry: { maxRetries: 3 },
  },
  {
    type: EventTypes.StockUpdate,
    handler: async ({ requestId, payload }) => {
      console.log(
        `[Event Handler] - Handling StockUpdate for request ${requestId}`,
      );

      throw new Error("Simulated failure in StockUpdate handler");
      // Simulate some processing logic
      await new Promise((resolve) => setTimeout(resolve, 100));
    },
    retry: { maxRetries: 2 },
  },
  {
    type: "IndependentEvent",
    handler: async ({ requestId, payload }) => {
      console.log(
        `[Event Handler] - Handling IndependentEvent for request ${requestId}`,
      );

      // Simulate some processing logic
      await new Promise((resolve) => setTimeout(resolve, 100));
    },
    retry: { maxRetries: 2 },
  },
];

const workflows: SynkroWorkflow[] = [
  {
    name: WorkflowTypes.ProcessOrder,
    onSuccess: WorkflowTypes.StartShipment,
    onComplete: WorkflowTypes.NotifyCustomer,
    steps: [
      {
        type: EventTypes.StockUpdate,
        handler: stockUpdateHandler,
      },
      {
        type: EventTypes.PaymentRequested,
        handler: paymentRequestedHandler,
        retry: { maxRetries: 3 },
        onSuccess: EventTypes.PaymentCompleted,
        onFailure: EventTypes.PaymentFailed,
      },
      {
        type: EventTypes.PaymentCompleted,
        handler: paymentCompletedHandler,
      },
      {
        type: EventTypes.PaymentFailed,
        handler: paymentFailedHandler,
      },
      {
        type: "TestEvent",
        handler: async ({ requestId, payload }) => {
          console.log(
            `[Event Handler] - Handling TestEvent for request ${requestId} that runs independently of the workflow's success or failure`,
          );
          // Simulate some processing logic
          await new Promise((resolve) => setTimeout(resolve, 100));
        },
      },
    ],
  },
  {
    name: WorkflowTypes.StartShipment,
    steps: [
      {
        type: EventTypes.ShippingRequested,
        handler: shippingRequestedHandler,
      },
    ],
  },
  {
    name: WorkflowTypes.NotifyCustomer,
    steps: [
      {
        type: EventTypes.NotifyCustomer,
        handler: async ({ requestId, payload }) => {
          const { orderId } = payload as { orderId: string };

          console.log(
            `[Event Handler] - Handling NotifyCustomer for request ${requestId} order ${orderId}`,
          );
          // Simulate some processing logic
          await new Promise((resolve) => setTimeout(resolve, 100));
        },
      },
    ],
  },
];

export async function eventManagerSetup(): Promise<Synkro> {
  if (synkro) return synkro;

  synkro = await Synkro.start({
    transport: "redis",
    redisUrl: process.env.REDIS_URL! || "redis://localhost:6379",
    debug: true,
    events,
    workflows,
  });

  return synkro;
}
