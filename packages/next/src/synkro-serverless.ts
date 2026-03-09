import type { RetentionConfig, SynkroWorkflow, SynkroWorkflowStep } from "@synkro/core";

import { createSynkro } from "./synkro.js";
import type { SynkroClient } from "./synkro.js";
import {
  HttpTransportManager,
  type HandlerRoute,
} from "./transport/http-transport.js";
import { WorkflowAdvancer } from "./transport/workflow-advancer.js";

export type ServerlessOptions = {
  /** Redis connection URL for cache operations (locking, dedup, state, metrics). */
  connectionUrl: string;
  /** The app's public base URL (e.g., "https://myapp.vercel.app"). */
  baseUrl: string;
  /** HMAC secret for signing/verifying HTTP requests between transport and handlers. */
  secret?: string;
  /** Enable debug logging. */
  debug?: boolean;
  /** Retention configuration for locks, dedup, state, and metrics TTLs. */
  retention?: RetentionConfig;
  /** Workflow definitions. */
  workflows?: SynkroWorkflow[];
  /** Maps event types / workflow step channels to HTTP route paths. */
  handlerRoutes?: HandlerRoute[];
};

export type SynkroServerless = {
  /** The SynkroClient for publishing events and querying state. */
  client: SynkroClient;
  /** The HTTP transport instance — pass this to createEventHandler / createWorkflowStepHandler. */
  transport: HttpTransportManager;
  /** The workflow advancer — pass this to createWorkflowStepHandler. */
  advancer: WorkflowAdvancer;
};

/**
 * Creates a synkro instance configured for serverless environments.
 *
 * Returns the client, transport, and workflow advancer as separate references
 * so they can be passed to `createEventHandler` and `createWorkflowStepHandler`.
 *
 * Usage:
 * ```ts
 * // lib/synkro.ts
 * import { createSynkroServerless } from "@synkro/next";
 *
 * export const synkro = createSynkroServerless({
 *   connectionUrl: process.env.REDIS_URL!,
 *   baseUrl: process.env.NEXT_PUBLIC_APP_URL!,
 *   secret: process.env.SYNKRO_SECRET,
 *   workflows: [...],
 *   handlerRoutes: [
 *     { eventType: "user.created", url: "/api/events/user-created" },
 *     { eventType: "workflow:checkout:validate", url: "/api/workflows/checkout/validate" },
 *   ],
 * });
 * ```
 */
export function createSynkroServerless(options: ServerlessOptions): SynkroServerless {
  const transport = new HttpTransportManager({
    redisUrl: options.connectionUrl,
    baseUrl: options.baseUrl,
    secret: options.secret,
    handlerRoutes: options.handlerRoutes,
  });

  const advancer = new WorkflowAdvancer({
    transport,
    workflows: options.workflows ?? [],
    stateTtl: options.retention?.stateTtl,
    lockTtl: options.retention?.lockTtl,
    dedupTtl: options.retention?.dedupTtl,
  });

  // In serverless mode, actual handlers live in HTTP route handlers (createWorkflowStepHandler).
  // Core's Synkro.start() requires every workflow step to have a handler, so we inject no-op
  // placeholders. These never fire because HttpTransportManager.subscribeToChannel is a no-op —
  // messages are dispatched via HTTP POST instead.
  const workflows = (options.workflows ?? []).map((w) => ({
    ...w,
    steps: w.steps.map((s): SynkroWorkflowStep => ({
      ...s,
      handler: s.handler ?? (() => {}),
    })),
  }));

  const client = createSynkro({
    transport,
    debug: options.debug,
    retention: options.retention,
    workflows,
  });

  return { client, transport, advancer };
}
