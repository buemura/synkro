type HandlerCtx = {
  requestId: string;
  payload: unknown;
};

export async function handler(ctx: HandlerCtx): Promise<void> {
  console.log(`Handling OrderCreated event with requestId: ${ctx.requestId}`);
  console.log("Payload:", ctx.payload);

  // Simulate some processing logic, e.g., saving to a database or calling another service
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(
    `Finished processing OrderCreated event with requestId: ${ctx.requestId}`,
  );
}
