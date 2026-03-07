# @synkro/core - Backlog

Items are organized by priority (P0 > P1 > P2 > P3). Security-sensitive items are tagged with `[SEC]`.

---

## P0 - Critical

### ~~TD-11: Validate workflow definitions at registration~~ ✅ Resolved
`registerWorkflows` now validates each workflow before registration: rejects empty name, empty steps, duplicate step types, and dangling `onSuccess`/`onFailure` targets with clear error messages.

### ~~TD-13: Harden message parsing paths `[SEC]`~~ ✅ Resolved in v0.9.2
All `JSON.parse` calls in `HandlerRegistry` and `WorkflowRegistry` are now wrapped with try/catch. Malformed messages and messages with missing/invalid `requestId` are logged and dropped. Workflow event callbacks parse upfront via `safeParse` before entering lock/transition logic.

### ~~IMP-07: Redis connection error handling~~ ✅ Resolved in v0.9.2
`RedisManager` now creates connections via `createClient` with exponential retry strategy (capped at 5s), error event logging, and connect event logging. Connection failures no longer surface as unhandled rejections.

---

## P1 - High

### ~~TD-01: No retry backoff strategy~~ ✅ Resolved in v0.10.0
`RetryConfig` now supports `delayMs` (base delay, default 1000ms), `backoff` (`"fixed"` or `"exponential"`), `jitter` (randomized spread around the delay), and `retryable` (predicate to skip retries for non-retryable errors). Existing `maxRetries` behavior is preserved with a default 1s fixed delay.

### ~~TD-04: Publish is fire-and-forget with no error handling~~ ✅ Resolved in v0.11.0
`TransportManager.publishMessage` is now `async` returning `Promise<void>`. `RedisManager` awaits the underlying Redis publish call. All call sites in `HandlerRegistry`, `WorkflowRegistry`, and `Synkro` now properly await publish and propagate errors.

### ~~TD-08: `SynkroOptions.transport` field inconsistency `[SEC]`~~ ✅ Resolved in v0.11.0
`Synkro.start` now explicitly validates the `transport` field. Only `"redis"`, `"in-memory"`, and `undefined` (defaults to Redis) are accepted. Invalid values throw a descriptive error instead of silently falling back to Redis.

### TD-10: No `unsubscribe` / `off` capability
No way to unregister an event handler or unsubscribe from a channel at runtime. Re-registering the same event calls subscribe again with no dedup. Should track per-event subscription once and provide explicit `off()` / `replace` semantics.

### ~~TD-05: `processingLocks` grow unbounded~~ ✅ Resolved in v0.11.0
Added warning logs when `processingLocks` exceeds 1000 entries in both `HandlerRegistry` and `WorkflowRegistry`. Existing `finally` block cleanup verified correct. Warning enables production monitoring of potential lock accumulation.

### TD-06: Global mutable logger state
**File:** `packages/core/src/logger.ts:1`
`debugEnabled` is a module-level mutable boolean. If multiple `Synkro` instances are created with different `debug` settings, the last one wins globally. Logger should be scoped per instance.

### TD-07: Hardcoded workflow state TTL
**File:** `packages/core/src/workflows/workflow-registry.ts:378`
Workflow state TTL is hardcoded to `86400` seconds (24h). Long-running workflows may lose state. Should be configurable per workflow.

### FT-01: Dead letter queue for failed events
**Starting points:** `packages/core/src/handlers/handler-registry.ts`, `packages/core/src/workflows/workflow-registry.ts`
Failed events (after retry exhaustion) are only published to a `event:{type}:failed` channel. There's no persistent dead letter queue for later inspection or replay. Enables operational recovery and observability.

### FT-02: Scheduled and delayed event publishing
**Starting points:** `packages/core/src/synkro.ts`, `packages/core/src/types.ts`, transport interfaces
Support publishing events on a schedule or with a delay (e.g., `synkro.schedule("cleanup:run", "0 */6 * * *")` or `synkro.publishDelayed(event, payload, delay)`). Needed for retries, timeouts, reminders, and saga-style workflows.

### ~~FT-03: Idempotency and deduplication support `[SEC]`~~ ✅ Resolved in v0.9.0 (TD-03)
Transport-level message dedup added to `RedisManager` using bounded in-memory cache keyed by `channel + requestId`. Handler and workflow registries also have distributed Redis locks (`setCacheIfNotExists`) for cross-instance dedup. Remaining risk: replay attacks with forged `requestId` values — mitigated by event schema validation (IMP-04).

### FT-06: Workflow timeout
No timeout mechanism for workflows or individual steps. A step that hangs will leave the workflow in `running` state forever. Add `timeout` to `SynkroWorkflowStep` and `SynkroWorkflow`.

### IMP-04: Event schema validation `[SEC]`
No validation on event payloads at publish or subscribe time. Integrating a schema registry (e.g., Zod schemas per event type) would catch malformed payloads early. **Security note:** Unvalidated payloads can carry injection vectors through the system if handlers pass data to databases, templates, or shell commands.

### IMP-06: Graceful shutdown
`stop()` disconnects Redis but doesn't wait for in-flight handlers to complete. Should drain active handlers before disconnecting to prevent data loss.

### ~~IMP-02: Error object in failure events~~ ✅ Resolved in v0.11.0
Failure events now include an `errors` array with serialized error details (`message`, `name`) from rejected handlers. Success events remain unchanged. Handles both `Error` instances and non-Error thrown values.

---

## P2 - Medium

### TD-03: In-memory transport ignores TTL
**File:** `packages/core/src/transport/in-memory.ts:39`
`setCache` accepts `_ttlSeconds` but never uses it. Cached entries persist forever in memory, making in-memory behavior diverge from Redis and hiding bugs during development.

### TD-09: `eslint-disable` for decorator types
**File:** `packages/core/src/handlers/decorators.ts:17-18`
Both decorators use `@typescript-eslint/no-unsafe-function-type` disable comments. Could use more precise typings with `(...args: any[]) => any` or proper method decorator signatures.

### ~~TD-12: Dead code - `eventToWorkflows` map~~ ✅ Resolved in v0.11.0
Removed the unused `eventToWorkflows` map declaration and population code from `WorkflowRegistry`.

### IMP-01: Typed payload generics
**File:** `packages/core/src/types.ts`, `packages/core/src/synkro.ts`
`HandlerCtx.payload` is typed as `unknown`, forcing every handler to cast. Introduce `HandlerCtx<T>` generics so handlers get typed payloads and `publish<T>(event, payload)` provides compile-time safety. Extend to decorator metadata typing.

### IMP-05: Structured logging
Logger only supports `console.log`/`warn`/`error` with unstructured args. Should support structured JSON output with fields like `requestId`, `eventType`, `workflowName` for production observability.

### IMP-08: Metrics/state retention controls
**File:** `packages/core/src/handlers/handler-registry.ts`
Event metrics keys (`synkro:metrics:...`) are monotonic with no TTL/reset policy, leading to unbounded key growth. Should add optional metrics TTL/reset hooks and retention config.

### IMP-09: Test coverage for transports
No dedicated test file for `in-memory.ts`. Most behavior tests use Redis mocks; in-memory transport parity is not verified. Should add shared transport contract tests executed against both implementations, covering TTL behavior, concurrent subscriptions, and edge cases.

### FT-04: Workflow state query API
**Starting points:** `packages/core/src/workflows/workflow-registry.ts`, `Synkro` public API
No way to query the current state of a running workflow from outside. `WorkflowRegistry` has `getState` but it's private. Expose `synkro.getWorkflowState(requestId, workflowName)` for external inspection.

### FT-07: Workflow cancellation
No way to cancel a running workflow. Should support `synkro.cancelWorkflow(requestId, workflowName)` that sets state to `cancelled` and stops step progression.

### FT-09: Event filtering / conditional handlers
Allow handlers to specify a filter predicate so they only execute when the payload matches certain conditions, reducing unnecessary handler invocations.

### FT-14: Implicit step registration for onSuccess/onFailure targets
**Starting points:** `packages/core/src/workflows/workflow-registry.ts`, `packages/core/src/types.ts`
Steps referenced in `onSuccess` or `onFailure` should not need to be repeated in the `steps` array. Currently, if `ProcessPayment` has `onFailure: "HandlePaymentFailure"`, the user must also add `{ type: "HandlePaymentFailure" }` to the steps list. The workflow engine should automatically recognize branch targets without requiring explicit step entries, reducing duplication and potential misconfiguration.

### FT-12: Event versioning
No event versioning support. When event payload schemas evolve, there's no way to handle v1 vs v2 of the same event. Support event type versioning (e.g., `user:created:v2`).

---

## P3 - Low / Nice-to-have

### IMP-03: Middleware / interceptor pipeline
No way to add cross-cutting concerns (logging, tracing, auth, validation) without modifying each handler. A middleware chain on `HandlerRegistry` (e.g., `synkro.use(middleware)`) would be valuable.

### FT-05: Parallel workflow steps
Currently workflows are strictly sequential (with branching). Support parallel step execution where multiple steps run concurrently and the workflow advances when all (or any) complete. E.g., `parallel: ["step-a", "step-b"]`.

### FT-08: Event replay / history
No event history or replay capability. Add an optional event store that records all published events with timestamps, enabling replay for debugging or recovery.

### FT-10: Workflow visualization / DAG export
Expose workflow definitions as a DAG structure (e.g., DOT format or JSON graph) for visualization in the UI dashboard. `introspect()` returns flat data but doesn't capture the branching graph.

### FT-11: Multiple transport support (NATS, Kafka, RabbitMQ)
The `TransportManager` interface is clean enough to support other message brokers. Adding NATS or Kafka transports would broaden adoption.

### FT-13: Workflow sub-workflows / composition
Support nesting workflows as steps within other workflows, enabling reusable workflow components. Currently chaining via `onSuccess`/`onFailure`/`onComplete` is flat.

---

## Security Summary

| Item | Risk | Description |
|------|------|-------------|
| ~~TD-13~~ | ~~High~~ | ✅ Resolved in v0.9.2 — safe parse with drop on malformed input |
| IMP-04 | High | No payload schema validation - injection can propagate through handlers |
| ~~FT-03~~ | ~~Medium~~ | ✅ Resolved in v0.9.0 — transport-level dedup + distributed locks |
| ~~TD-08~~ | ~~Medium~~ | ✅ Resolved in v0.11.0 — explicit validation with error on invalid transport |
