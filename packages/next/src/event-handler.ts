import { createHmac } from "node:crypto";

import { executeHandler } from "@synkro/core";
import type {
  HandlerFunction,
  RetentionConfig,
  RetryConfig,
  SchemaValidator,
  TransportManager,
} from "@synkro/core";

import type { SynkroClient } from "./synkro.js";

export type EventHandlerOptions = {
  /** The event type this handler processes. */
  eventType: string;
  /** The handler function to execute. */
  handler: HandlerFunction;
  /** The transport instance for dedup, locking, and metrics. */
  transport: TransportManager;
  /** Retry configuration for the handler. */
  retry?: RetryConfig;
  /** Schema validator for the event payload. */
  schema?: SchemaValidator;
  /** Retention config for locks, dedup, and metrics TTLs. */
  retention?: RetentionConfig;
  /** HMAC secret for verifying incoming requests from the transport. */
  secret?: string;
};

/**
 * Creates a Next.js route handler (POST) that processes a synkro event.
 *
 * The handler executes with full deduplication, distributed locking,
 * retry logic, metrics tracking, and completion/failure event publication —
 * the same guarantees as persistent pub/sub handlers.
 *
 * Usage in a Next.js App Router route:
 * ```ts
 * // app/api/events/user-created/route.ts
 * import { synkro } from "@/lib/synkro";
 *
 * export const POST = createEventHandler(synkro.client, {
 *   eventType: "user.created",
 *   transport: synkro.transport,
 *   handler: async (ctx) => { ... },
 * });
 * ```
 */
export function createEventHandler(
  synkro: SynkroClient,
  options: EventHandlerOptions,
): (request: Request) => Promise<Response> {
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

    const result = await executeHandler({
      transport: options.transport,
      eventType: options.eventType,
      requestId: body.requestId,
      payload: body.payload,
      handler: options.handler,
      publishFn: instance.publish.bind(instance),
      retry: options.retry,
      schema: options.schema,
      retention: options.retention,
    });

    if (result.success) {
      return Response.json({ success: true, requestId: body.requestId });
    }

    return Response.json(
      { success: false, requestId: body.requestId, error: result.error },
      { status: 500 },
    );
  };
}
