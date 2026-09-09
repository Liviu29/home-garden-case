# ADR-002: Signals + NgRx SignalStore over classic NgRx Store

**Status:** accepted · **Date:** 2026-09-09

## Context
The app needs shared state (gardens across dashboard/list/detail), derived data (occupancy, humidity aggregates), and optimistic mutations with rollback — under zoneless change detection.

## Options
1. **Classic NgRx Store** (actions/reducers/effects/selectors) — maximal ceremony, event-sourced audit trail we don't need at this scale; ~4 files per feature slice.
2. **Plain services with signals** — minimal, but no shared structure; each store reinvents entity handling and status tracking, and drift sets in fast.
3. **NgRx SignalStore** (`@ngrx/signals`) — signal-native store with `withState`/`withComputed`/`withMethods`/`withEntities`, deep-readonly state, DI-friendly, tiny API.

## Decision
**SignalStore**, as the single state pattern app-wide. Private state via `withState`, public surface via computeds, mutations only through methods, custom `withRequestStatus`/`withOptimistic` features shared across stores.

## Consequences
- Perfect fit with zoneless + OnPush: components read signals, change detection is precise.
- Structure without boilerplate; stores stay testable as plain classes via TestBed.
- We give up classic-Store devtools/event log; acceptable at this scale and partially recovered by logging store method calls in dev mode.
- Rule from the guidelines applies: once SignalStore is in, no second state pattern may appear beside it.
