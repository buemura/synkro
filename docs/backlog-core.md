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

### ~~TD-10: No `unsubscribe` / `off` capability~~ ✅ Resolved in v0.15.0
`synkro.off(eventType, handler?)` removes specific or all handlers for an event type. When no handlers remain, the transport channel subscription is cleaned up automatically.

### ~~TD-05: `processingLocks` grow unbounded~~ ✅ Resolved in v0.11.0
Added warning logs when `processingLocks` exceeds 1000 entries in both `HandlerRegistry` and `WorkflowRegistry`. Existing `finally` block cleanup verified correct. Warning enables production monitoring of potential lock accumulation.

### ~~TD-06: Global mutable logger state~~ ✅ Resolved in v0.14.0
Logger is now a class (`Logger`) with instance-level `debugEnabled` state. Each `Synkro` instance creates its own `Logger` and passes it to all registries. Multiple instances with different `debug` settings no longer conflict.

### ~~TD-07: Hardcoded workflow state TTL~~ ✅ Resolved in v0.13.0
Workflow state TTL is now configurable via `retention.stateTtl` in `SynkroOptions`. Subsumed by IMP-08.

### ~~FT-01: Dead letter queue for failed events~~ ✅ Resolved in v0.16.0
Opt-in `deadLetterQueue: true` persists failed events to `synkro:dlq:{eventType}` lists after retry exhaustion. New API methods: `getDeadLetterItems()`, `replayDeadLetterItem()`, `clearDeadLetterQueue()`. Transport interface extended with `pushToList`, `getListRange`, `deleteKey`.

### FT-02: Scheduled and delayed event publishing
**Starting points:** `packages/core/src/synkro.ts`, `packages/core/src/types.ts`, transport interfaces
Support publishing events on a schedule or with a delay (e.g., `synkro.schedule("cleanup:run", "0 */6 * * *")` or `synkro.publishDelayed(event, payload, delay)`). Needed for retries, timeouts, reminders, and saga-style workflows.

### ~~FT-03: Idempotency and deduplication support `[SEC]`~~ ✅ Resolved in v0.9.0 (TD-03)
Transport-level message dedup added to `RedisManager` using bounded in-memory cache keyed by `channel + requestId`. Handler and workflow registries also have distributed Redis locks (`setCacheIfNotExists`) for cross-instance dedup. Remaining risk: replay attacks with forged `requestId` values — mitigated by event schema validation (IMP-04).

### ~~FT-06: Workflow timeout~~ ✅ Resolved in v0.14.0
`SynkroWorkflowStep` and `SynkroWorkflow` now support an optional `timeoutMs` field. When a step exceeds its timeout, a synthetic failure event is published, triggering the `onFailure` path or marking the workflow as failed. Step-level timeout overrides workflow-level.

### ~~IMP-04: Event schema validation `[SEC]`~~ ✅ Resolved in v0.14.0
`SynkroOptions` now accepts a `schemas` map (`Record<string, SchemaValidator>`) for global event-type validation. Per-event schemas can also be set via the `schema` field on `SynkroEvent`. Validation occurs at publish time (throws synchronously) and at handler dispatch (global: drops message; per-entry: triggers failure). `SchemaValidator` is a simple `(payload: unknown) => void` function that throws on invalid input — compatible with Zod, Joi, or any validation library.

### ~~IMP-06: Graceful shutdown~~ ✅ Resolved in v0.14.0
`stop()` now drains active handlers before disconnecting. Polls `processingLocks.size` on both `HandlerRegistry` and `WorkflowRegistry` every 50ms until all handlers complete or the `drainTimeout` (default 5000ms, configurable via `SynkroOptions.drainTimeout`) is reached. Logs a warning if forced to disconnect with active handlers.

### ~~IMP-02: Error object in failure events~~ ✅ Resolved in v0.11.0
Failure events now include an `errors` array with serialized error details (`message`, `name`) from rejected handlers. Success events remain unchanged. Handles both `Error` instances and non-Error thrown values.

---

## P2 - Medium

### ~~TD-03: In-memory transport ignores TTL~~ ✅ Resolved in v0.14.0
`InMemoryManager` now correctly applies TTL via `applyTtl()` in `setCache()` and `setCacheIfNotExists()`, with lazy eviction on read via `evictIfExpired()`. The original `_ttlSeconds` unused parameter was renamed and wired up in a prior change.

### ~~TD-09: `eslint-disable` for decorator types~~ ✅ Resolved in v0.15.0
Replaced `Function` type constraint with `(...args: any[]) => any` in both decorators, eliminating the eslint-disable comments.

### ~~TD-12: Dead code - `eventToWorkflows` map~~ ✅ Resolved in v0.11.0
Removed the unused `eventToWorkflows` map declaration and population code from `WorkflowRegistry`.

### ~~IMP-01: Typed payload generics~~ ✅ Resolved in v0.15.0
`HandlerCtx<T>`, `HandlerFunction<T>`, and `SynkroEvent<T>` are now generic with a default of `unknown`. Handlers can opt into typed payloads for compile-time safety without breaking existing code.

### ~~IMP-05: Structured logging~~ ✅ Resolved in v0.16.0
Logger now supports `logFormat: "json"` for structured JSON output with `level`, `msg`, `timestamp`, and contextual fields. All internal log call sites updated to pass structured fields. Text mode (default) remains backward-compatible.

### ~~IMP-08: Configurable key retention / TTL policy~~ ✅ Resolved in v0.13.0
`SynkroOptions` now accepts a `retention` config with per-category TTLs: `lockTtl`, `dedupTtl`, `stateTtl`, and `metricsTtl`. All fields are optional with sensible defaults. Metrics keys now support TTL via an extended `incrementCache` transport method. Also resolves TD-07.

### IMP-09: Test coverage for transports
No dedicated test file for `in-memory.ts`. Most behavior tests use Redis mocks; in-memory transport parity is not verified. Should add shared transport contract tests executed against both implementations, covering TTL behavior, concurrent subscriptions, and edge cases.

### ~~FT-04: Workflow state query API~~ ✅ Resolved in v0.15.0
`synkro.getWorkflowState(requestId, workflowName)` returns the current `WorkflowState` (with `status`, `currentStep`, `workflowName`) or `null`. The `WorkflowState` type is exported from `@synkro/core`.

### ~~FT-07: Workflow cancellation~~ ✅ Resolved in v0.15.0
`synkro.cancelWorkflow(requestId, workflowName)` sets status to `"cancelled"`, clears active step timers, and prevents further step progression. Returns `true` if cancelled, `false` if not in a cancellable state.

### ~~FT-09: Event filtering / conditional handlers~~ ✅ Resolved in v0.16.0
`SynkroEvent.filter` and `synkro.on()` now accept an optional `EventFilter` predicate. Handlers whose filter returns `false` are skipped without triggering failure. When all handlers are filtered out, no events or metrics are emitted.

### ~~FT-14: Implicit step registration for onSuccess/onFailure targets~~ ✅ Resolved in v0.12.0
Steps referenced in `onSuccess` or `onFailure` are now automatically appended as implicit steps during workflow normalization. Explicit declaration in the `steps` array is no longer required, eliminating duplication while remaining fully backward compatible.

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
| ~~IMP-04~~ | ~~High~~ | ✅ Resolved in v0.14.0 — schema validation at publish and handler dispatch |
| ~~FT-03~~ | ~~Medium~~ | ✅ Resolved in v0.9.0 — transport-level dedup + distributed locks |
| ~~TD-08~~ | ~~Medium~~ | ✅ Resolved in v0.11.0 — explicit validation with error on invalid transport |
