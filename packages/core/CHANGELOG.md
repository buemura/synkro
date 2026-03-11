# Changelog

All notable changes to this project will be documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.18.1] - 2026-03-11

### Fixed

- **Workflow payload propagation** — `setPayload()` changes inside workflow step handlers now correctly flow to subsequent steps. Previously, `HandlerRegistry` published the original event payload in the completion event instead of the updated `ctx.payload`, causing `setPayload` mutations to be lost between workflow steps.

## [0.18.0] - 2026-03-10

### Added

- **Scheduled and delayed event publishing** (FT-02): `synkro.publishDelayed(event, payload, delayMs)` publishes an event after a one-shot delay. `synkro.schedule(eventType, intervalMs, payload?)` creates recurring event publishes. `synkro.unschedule(scheduleId)` cancels a schedule. All timers cleaned up on `synkro.stop()`. Active schedules included in `introspect().schedules`.
- **Middleware / interceptor pipeline** (IMP-03): Koa-style middleware chain for cross-cutting concerns. `synkro.use(middleware)` or `SynkroOptions.middlewares` for registration. Middleware signature: `(ctx: MiddlewareCtx, next: () => Promise<void>) => Promise<void>`. Executes in registration order (onion model), wrapping each handler independently. Works on regular events, workflow steps, and standalone `executeHandler`. New exports: `composeMiddleware`, `MiddlewareCtx`, `MiddlewareFunction`.
- **Workflow visualization / DAG export** (FT-10): `synkro.getWorkflowGraph(workflowName)` returns a `WorkflowGraph` with `nodes` and `edges`. `introspect().graphs` returns all workflow DAGs. New exports: `WorkflowGraph`, `WorkflowGraphNode`, `WorkflowGraphEdge`.

## [0.17.0] - 2026-03-10

### Added

- **Transport contract test suite** (IMP-09): Shared `transportContractTests` suite validating `InMemoryManager` against the full `TransportManager` interface. 24 contract tests covering pub/sub round-trips, cache CRUD with TTL expiry, `setCacheIfNotExists` atomicity, increment, list operations, `deleteKey`, and `disconnect` cleanup.
- **Event versioning** (FT-12): Events following the `base:event:vN` convention (e.g., `user:created:v2`) trigger automatic base-event fanout. Handlers on the base event receive all versions as a catch-all; handlers on a specific version receive only that version. Unversioned events work unchanged. New exports: `parseEventType()`, `isVersionedEvent()`, `ParsedEventType`.

## [0.16.0] - 2026-03-09

### Added

- **Structured logging** (IMP-05): Logger now supports `"json"` output format via `logFormat` option in `SynkroOptions`. JSON mode outputs machine-parseable log entries with `level`, `msg`, `timestamp`, and contextual fields (`requestId`, `eventType`, `workflowName`). Default `"text"` format is backward-compatible. `LogFormat` type exported.
- **Event filtering** (FT-09): Handlers can specify a `filter` predicate via `SynkroEvent.filter` or `synkro.on()`. When a filter returns `false`, the handler is skipped without triggering failure events. When all handlers for an event are filtered out, no metrics or completion/failure events are emitted. `EventFilter` type exported.
- **Dead letter queue** (FT-01): Failed events (after retry exhaustion) can be persisted to a DLQ for later inspection and replay. Opt-in via `deadLetterQueue: true` in `SynkroOptions`. New methods: `synkro.getDeadLetterItems(eventType, { limit })`, `synkro.replayDeadLetterItem(item)`, `synkro.clearDeadLetterQueue(eventType)`. `DeadLetterItem` type exported.

### Changed

- All internal log messages now use structured fields instead of string interpolation, improving observability in both text and JSON modes.
- `TransportManager` interface extended with `pushToList()`, `getListRange()`, and `deleteKey()` methods. Both Redis and in-memory transports implement them.

## [0.15.1] - 2026-03-09

### Added

- **Custom transport support** (FT-10): `SynkroOptions.transport` now accepts a `TransportManager` instance in addition to `"redis"` and `"in-memory"` strings, enabling custom transport implementations without modifying the core package.
- **Standalone `executeHandler()` utility** (FT-11): Extracted handler execution logic (dedup, distributed locking, retry with backoff, metrics, completion event publication) into a standalone function. New exports: `ExecuteHandlerOptions`, `ExecuteHandlerResult`.

## [0.15.0] - 2026-03-09

### Added

- **Unsubscribe / `off()` capability** (TD-10): `synkro.off(eventType, handler?)` to unregister event handlers at runtime. Removes specific handler or all handlers for the event type. Transport channel subscription cleaned up when no handlers remain.
- **Workflow state query API** (FT-04): `synkro.getWorkflowState(requestId, workflowName)` returns a `WorkflowState` object or `null`. New export: `WorkflowState`.
- **Workflow cancellation** (FT-07): `synkro.cancelWorkflow(requestId, workflowName)` cancels a running workflow, setting status to `"cancelled"` and clearing active step timers.
- **Typed payload generics** (IMP-01): `HandlerCtx`, `HandlerFunction`, and `SynkroEvent` are now generic types with a default of `unknown`. Fully backward-compatible.

### Fixed

- **eslint-disable for decorator types** (TD-09): Replaced `Function` type constraint in `@OnEvent` and `@OnWorkflowStep` decorators with `(...args: any[]) => any`.

## [0.14.0] - 2026-03-07

### Added

- **Event schema validation** (IMP-04) `[SEC]`: Schema validation for event payloads at publish and handler dispatch time. `SynkroOptions` accepts a `schemas` map. Per-event schemas via `schema` field on `SynkroEvent`. `SchemaValidator` is a `(payload: unknown) => void` function compatible with any validation library.
- **Workflow timeout** (FT-06): `SynkroWorkflowStep` and `SynkroWorkflow` support optional `timeoutMs`. Step-level timeout overrides workflow-level timeout. Synthetic failure event published on timeout.
- **Graceful shutdown** (IMP-06): `stop()` drains active handlers before disconnecting. Configurable `drainTimeout` (default 5000ms) via `SynkroOptions.drainTimeout`.
- **Instance-scoped logger** (TD-06): `Logger` is now a class with instance-level `debugEnabled` state. Each `Synkro` instance creates its own `Logger`. The `Logger` class is exported.

### Verified

- **In-memory transport TTL** (TD-03): Confirmed `InMemoryManager` correctly applies TTL via `applyTtl()` with lazy eviction on read.

## [0.13.0] - 2026-03-07

### Added

- **Configurable key retention / TTL policy** (IMP-08): Redis keys now have configurable TTLs via `retention` option in `SynkroOptions`. Fields: `lockTtl`, `dedupTtl`, `stateTtl`, `metricsTtl`. All optional — omitting preserves defaults. New export: `RetentionConfig`.
- **Configurable workflow state TTL** (TD-07): Workflow state TTL is no longer hardcoded to 24 hours. Use `retention.stateTtl` to configure it.

## [0.12.0] - 2026-03-07

### Added

- **Implicit step registration** (FT-14): Workflow steps referenced by `onSuccess` or `onFailure` no longer need explicit declaration in the `steps` array. Missing branch targets are auto-appended during registration. Fully backward-compatible.

## [0.11.0] - 2026-03-07

### Added

- **Error details in failure events** (IMP-02): Failure events now include an `errors` array with serialized error details (`message`, `name`).
- **`processingLocks` observability** (TD-05): Warning logs when `processingLocks` exceeds 1000 entries in `HandlerRegistry` and `WorkflowRegistry`.

### Changed

- **Async publish with error propagation** (TD-04): **Breaking** — `TransportManager.publishMessage` signature changed from `void` to `Promise<void>`. Custom transport implementations must update their return type.
- **Validate transport field** (TD-08) `[SEC]`: `Synkro.start()` now validates the `transport` option. Only `"redis"`, `"in-memory"`, and `undefined` are accepted. Invalid values throw a descriptive error.

### Removed

- **Dead code** (TD-12): Removed unused `eventToWorkflows` map from `WorkflowRegistry`.

## [0.10.0] - 2026-03-07

### Added

- **Retry backoff strategy** (TD-01): `RetryConfig` now supports `delayMs`, `backoff` (`"fixed"` | `"exponential"`), `jitter`, and `retryable` predicate. New export: `RetryBackoffStrategy`.

## [0.9.2] - 2026-03-07

### Fixed

- **Harden message parsing paths** (TD-13) `[SEC]`: All `JSON.parse` calls in `HandlerRegistry` and `WorkflowRegistry` wrapped with try/catch. Malformed messages logged and dropped instead of crashing.
- **Redis connection error handling** (IMP-07): `RedisManager` now creates connections with retry strategy (exponential backoff capped at 5s), error event handler, and connect event handler.

## [0.9.1] - 2026-03-07

### Added

- **Validate workflow definitions at registration** (TD-11): `registerWorkflows` validates each workflow before registration — empty name, empty steps, duplicate step types, and dangling `onSuccess`/`onFailure` targets now throw clear errors.

## [0.9.0] - 2026-03-06

### Changed

- **`logger.warn` now always emits** (TD-01): **Breaking** — Warnings always emit via `console.warn` regardless of the `debug` flag. The `debug` flag now exclusively controls verbose debug traces.

### Fixed

- **Multiple subscriptions no longer silently overwrite callbacks** (TD-02): `RedisManager` and `HandlerRegistry` now use `Set`-based storage and fan out to all registered callbacks/handlers.
- **Transport-level message deduplication** (TD-03): `RedisManager` deduplicates messages at the transport layer using a bounded in-memory cache (max 10,000 entries, 5-second window) before invoking callbacks.
