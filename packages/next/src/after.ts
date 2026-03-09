import type { SynkroClient } from "./synkro.js";

/**
 * Publishes an event after the HTTP response has been sent, using Next.js 15+'s `after()` API.
 * This allows fire-and-forget event publishing without blocking the response.
 *
 * Must be called within a Next.js route handler or Server Component context.
 */
export function publishAfterResponse(
  synkro: SynkroClient,
  event: string,
  payload?: unknown,
  requestId?: string,
): void {
  // Dynamic import to avoid hard dependency on next/server at module load time.
  // The `after` function is only available in Next.js 15+.
  import("next/server").then(({ after }) => {
    after(async () => {
      await synkro.publish(event, payload, requestId);
    });
  });
}
