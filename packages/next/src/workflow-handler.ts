import { createHmac } from "node:crypto";

import { executeHandler } from "@synkro/core";
import type {
  HandlerFunction,
  RetentionConfig,
  RetryConfig,
  TransportManager,
} from "@synkro/core";

import type { SynkroClient } from "./synkro.js";
import type { WorkflowAdvancer } from "./transport/workflow-advancer.js";

export type WorkflowStepHandlerOptions = {
  /** The workflow name. */
  workflowName: string;
  /** The step type within the workflow. */
  stepType: string;
  /** The handler function to execute for this step. */
  handler: HandlerFunction;
  /** The transport instance for dedup, locking, and metrics. */
  transport: TransportManager;
  /** The workflow advancer that routes to the next step after execution. */
  advancer: WorkflowAdvancer;
  /** Retry configuration for the handler. */
  retry?: RetryConfig;
  /** Retention config for locks, dedup, and metrics TTLs. */
  retention?: RetentionConfig;
  /** HMAC secret for verifying incoming requests from the transport. */
  secret?: string;
};

/**
 * Creates a Next.js route handler (POST) that processes a workflow step.
 *
 * After executing the step handler, it automatically advances the workflow
 * to the next step by calling the appropriate HTTP route via the transport.
 *
 * Usage in a Next.js App Router route:
 * ```ts
 * // app/api/workflows/checkout/validate/route.ts
 * import { synkro } from "@/lib/synkro";
 *
 * export const POST = createWorkflowStepHandler(synkro.client, {
 *   workflowName: "checkout",
 *   stepType: "validate",
 *   transport: synkro.transport,
 *   advancer: synkro.advancer,
 *   handler: async (ctx) => { ... },
 * });
 * ```
 */
export function createWorkflowStepHandler(
  synkro: SynkroClient,
  options: WorkflowStepHandlerOptions,
): (request: Request) => Promise<Response> {
  const eventType = `workflow:${options.workflowName}:${options.stepType}`;

  return async (request: Request) => {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Verify HMAC signature if secret is configured
    if (options.secret) {
      const signature = request.headers.get("x-synkro-signature");
      if (!signature) {
        return Response.json({ error: "Missing signature" }, { status: 401 });
      }
      const bodyText = await request.clone().text();
      const expected = createHmac("sha256", options.secret)
        .update(bodyText)
        .digest("hex");
      if (signature !== expected) {
        return Response.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    let body: { requestId: string; payload: unknown };
    try {
      body = (await request.json()) as { requestId: string; payload: unknown };
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.requestId || typeof body.requestId !== "string") {
      return Response.json({ error: "Missing or invalid requestId" }, { status: 400 });
    }

    const instance = await synkro.getInstance();

    // Execute the step handler with full guarantees
    const result = await executeHandler({
      transport: options.transport,
      eventType,
      requestId: body.requestId,
      payload: body.payload,
      handler: options.handler,
      publishFn: instance.publish.bind(instance),
      retry: options.retry,
      retention: options.retention,
      trackMetrics: false, // Workflow step metrics are tracked at the workflow level
    });

    // Advance the workflow to the next step
    await options.advancer.advanceAfterStep(
      options.workflowName,
      options.stepType,
      body.requestId,
      body.payload,
      result.success,
    );

    if (result.success) {
      return Response.json({ success: true, requestId: body.requestId });
    }

    return Response.json(
      { success: false, requestId: body.requestId, error: result.error },
      { status: 500 },
    );
  };
}
