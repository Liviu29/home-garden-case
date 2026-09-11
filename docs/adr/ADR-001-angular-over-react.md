# ADR-001: Angular instead of a React meta-framework

**Status:** accepted · **Date:** 2026-09-09

## Context

The case's technical requirements state: _"Technology Stack: Use a React meta-framework like React Router or Next.js."_ The role under evaluation is Angular Lead/Architect, and the use of Angular for this case was discussed and approved with the In The Pocket team beforehand.

## Decision

Build the frontend with **Angular 22** (standalone, zoneless, signals), state with NgRx SignalStore, UI on Angular Material M3.

## Consequences

- The case demonstrates architecture skills in the stack the role actually requires.
- Everything the case wants to evaluate is framework-agnostic and still fully demonstrated: resilience against a slow/flaky API, state management, validation mirroring, testing of business logic, incremental commits, documentation.
- A React reviewer can map concepts 1:1: SignalStore ↔ Zustand/Redux Toolkit, SWR cache ↔ TanStack Query, signals ↔ memoized selectors, `@defer` ↔ `React.lazy`/Suspense. The README includes this mapping so review friction stays low.
