# Changelog

All notable changes to this project will be documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.16.0] - 2026-03-09

### Added

- **Structured logging** (IMP-05): Logger now supports `"json"` output format via `logFormat` option in `SynkroOptions`. JSON mode outputs machine-parseable log entries with `level`, `msg`, `timestamp`, and contextual fields (`requestId`, `eventType`, `workflowName`). Default `"text"` format is backward-compatible. `LogFormat` type exported.
- **Event filtering** (FT-09): Handlers can specify a `filter` predicate via `SynkroEvent.filter` or `synkro.on()`. When a filter returns `false`, the handler is skipped without triggering failure events. When all handlers for an event are filtered out, no metrics or completion/failure events are emitted. `EventFilter` type exported.
- **Dead letter queue** (FT-01): Failed events (after retry exhaustion) can be persisted to a DLQ for later inspection and replay. Opt-in via `deadLetterQueue: true` in `SynkroOptions`. New methods: `synkro.getDeadLetterItems(eventType, { limit })`, `synkro.replayDeadLetterItem(item)`, `synkro.clearDeadLetterQueue(eventType)`. `DeadLetterItem` type exported.

### Changed

- All internal log messages now use structured fields instead of string interpolation, improving observability in both text and JSON modes.
- `TransportManager` interface extended with `pushToList()`, `getListRange()`, and `deleteKey()` methods. Both Redis and in-memory transports implement them.
