# ADR-002: Signals + NgRx SignalStore over classic NgRx Store

**Status:** accepted · **Date:** 2026-09-09

## Context

The app needs shared state (gardens across dashboard, list and detail), derived data (occupancy,
humidity aggregates) and mutations with per-entity pending states — under zoneless change
detection.

## Options

1. **Classic NgRx Store** (actions/reducers/effects/selectors) — maximal ceremony and an
   event-sourced audit trail this scale does not need; ~4 files per feature slice.
2. **Plain services with signals** — minimal, but no shared structure; each store reinvents status
   tracking, and drift sets in fast.
3. **NgRx SignalStore** (`@ngrx/signals`) — a signal-native store with `withState` /
   `withComputed` / `withMethods`, deep-readonly state, DI-friendly, a tiny API.

## Decision

**SignalStore** for shared feature state: private state via `withState`, the public surface via
computeds, writes only through methods; `rxMethod` where a store must follow a signal source (the
plants fan-out). Small, self-contained state (session, toasts, theme) uses plain signal classes with
the same private-writable / public-readonly shape — no second store library beside it.

Shared custom store features (a `withRequestStatus()`-style helper) were considered and **not
created**: the three stores have different lifecycles — an SWR list with idempotent appends, a
detail store with per-entity mutation ghosts, a per-garden fan-out index — and a common feature would
either flatten those semantics or grow configuration until the state stops being domain-readable.
What the stores do share is smaller than a feature: the mutation verdict type and the one policy
for a failed write (`state/mutation-result.ts`), plain functions.

The library's own idioms are used where each fits, rather than re-implemented: `withProps` for a
store's private collaborators and tokens (never state), `withLinkedState` for state that a key
resets (the last created plant, keyed on the garden), `signalMethod` for a store that follows a
signal source without RxJS (`loadFor(gardenId)`), `withHooks` for what happens on destroy. A
route-scoped store is reached by its dialogs through the screen's injector, not passed as data.

## Consequences

- A natural fit with zoneless + OnPush: components read signals, change detection is precise.
- Structure without boilerplate; stores are tested as behaviour through TestBed.
- Classic-Store devtools and the action log are given up — acceptable at this scale.
- The guideline holds: no second state pattern appears beside SignalStore.
