import { Orko, type OrkoEvent, type OrkoWorkflow } from "@orko/core";

import { OrderEventHandler } from "../handlers/order-event.handler";
import { OrderWorkflowHandler } from "../handlers/order-workflow.handler";
import { ShipmentWorkflowHandler } from "../handlers/shipment-workflow.handler";
import { stockUpdateHandler } from "../handlers/stock-update";
import { EventTypes, WorkflowTypes } from "./event-types";

let orko: Orko | null = null;

// Inline event handlers (traditional approach — still supported)
const events: OrkoEvent[] = [
  {
    type: "test-event",
    handler: async ({ requestId }) => {
      console.log(
        `[Event Handler] - Handling test-event for request ${requestId}`,
      );
    },
  },
  {
    type: "test-event-2",
    handler: async ({ requestId }) => {
      console.log(
        `[Event Handler] - Handling test-event-2 for request ${requestId}`,
      );
    },
  },
  {
    type: "test-event-3",
    handler: async ({ requestId }) => {
      console.log(
        `[Event Handler] - Handling test-event for request ${requestId}`,
      );
    },
  },
  {
    type: "test-event-4",
    handler: async ({ requestId }) => {
      console.log(
        `[Event Handler] - Handling test-event for request ${requestId}`,
      );
    },
  },
];

// Workflow definitions — handlers come from decorated classes via `handlers` option
const workflows: OrkoWorkflow[] = [
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
      {
        // Inline handler in a workflow step (mixed approach)
        type: "TestEvent",
        handler: async ({ requestId }) => {
          console.log(
            `[Event Handler] - Handling TestEvent for request ${requestId} that runs independently of the workflow's success or failure`,
          );
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
      },
    ],
  },
  {
    name: WorkflowTypes.NotifyCustomer,
    steps: [
      {
        type: EventTypes.NotifyCustomer,
      },
    ],
  },
  {
    name: "IndependentWorkflow2",
    steps: [
      {
        type: "IndependentEvent",
        handler: async ({ requestId }) => {
          console.log(
            `[Event Handler] - Handling IndependentEvent in IndependentWorkflow2 for request ${requestId}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        },
      },
    ],
  },
  {
    name: "IndependentWorkflow3",
    steps: [
      {
        type: "IndependentEvent",
        handler: async ({ requestId }) => {
          console.log(
            `[Event Handler] - Handling IndependentEvent in IndependentWorkflow3 for request ${requestId}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        },
      },
    ],
  },
  {
    name: "IndependentWorkflow4",
    steps: [
      {
        type: "IndependentEvent",
        handler: async ({ requestId }) => {
          console.log(
            `[Event Handler] - Handling IndependentEvent in IndependentWorkflow4 for request ${requestId}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        },
      },
    ],
  },
];

export async function eventManagerSetup(): Promise<Orko> {
  if (orko) return orko;

  orko = await Orko.start({
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

  return orko;
}
