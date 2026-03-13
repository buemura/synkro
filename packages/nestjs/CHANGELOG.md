# Changelog

All notable changes to this project will be documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.3] - 2026-03-13

### Changed

- Bumped `@synkro/core` peer dependency from `^0.18.1` to `^0.19.0`.

## [0.5.2] - 2026-03-11

### Changed

- Bumped `@synkro/core` peer dependency from `^0.15.0` to `^0.18.1`.

## [0.5.1] - 2026-03-09

### Changed

- Bumped `@synkro/core` peer dependency from `^0.13.0` to `^0.15.0` to align with latest core (includes `off()`, workflow state query, cancellation, and typed generics).

## [0.5.0] - 2026-03-07

### Added

- **Retention option** (IMP-03): Configure Redis key TTLs directly through module options via `retention` field in `SynkroModule.forRoot()`.
- **Expanded public service API** (IMP-04): `SynkroService` now exposes `introspect()` and `getEventMetrics(eventType)` directly.
- **Readiness checks on public methods** (TD-07): All public methods throw a clear error if called before module initialization completes.

### Changed

- **Peer dependency** updated from `@synkro/core ^0.9.0` to `^0.13.0`.
- **Remove noop handler masking** (TD-03) `[SEC]`: **Breaking** — Workflow steps without a handler now throw at startup instead of silently running a noop.
- **Safe module destroy on partial init** (TD-06): `onModuleDestroy` guards against uninitialized state.
