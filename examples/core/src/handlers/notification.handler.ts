import { type HandlerCtx } from "@synkro/core";

// export class NotificationWorkflowHandler {
//   @OnWorkflowStep(WorkflowTypes.NotifyCustomer, EventTypes.NotifyCustomer)
//   async handleNotifyCustomer(ctx: HandlerCtx) {
//     console.log(
//       `[NotificationWorkflowHandler.handleNotifyCustomer] - Handling NotifyCustomer for request: ${ctx.requestId}`,
//     );
//     await new Promise((resolve) => setTimeout(resolve, 100));
//   }
// }

export async function handleNotifyCustomer(ctx: HandlerCtx) {
  console.log(
    `[handleNotifyCustomer] - Handling NotifyCustomer for request: ${ctx.requestId}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
}
