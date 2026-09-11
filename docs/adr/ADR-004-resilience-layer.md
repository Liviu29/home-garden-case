# ADR-004: Client resilience layer (SWR cache + retry + confirmed mutations)

**Status:** accepted · **Date:** 2026-09-09

## Context

The backend intentionally adds 200–2000 ms latency to every response and fails 10% of requests
with a 500 (`slow-api.ts`, `random-errors.ts`). The case asks that UX not suffer, and its
performance bonus asks for a way to speed up frequently used data.

## Decision

Three cooperating mechanisms, all in `core` and the stores, invisible to components:

1. **Retry interceptor** — a functional `HttpInterceptorFn` that retries 5xx and network errors
   (never a 4xx verdict) up to 3 times with exponential backoff and full jitter (base 250 ms, factor
   3, cap 3 s). Writes are retried too: that is safe **here** because the failure plugin fires in
   `onRequest`, before any handler runs — a production API would need idempotency keys (ADR-005).
2. **QueryCache (stale-while-revalidate)** — a keyed GET cache: a fresh hit renders instantly with no
   request; a stale hit renders instantly and revalidates in the background; a miss shows the
   skeleton. TTL 30 s (configuration), identical in-flight requests de-duplicated, invalidation and
   write-through driven by mutations from one key registry.
3. **Server-confirmed mutations with in-place ghosts** — nothing is optimistic. Create and update wait
   for the server, because the server owns the verdicts the form must render (the capacity rule);
   deletes keep the entity visible and inert until the server confirms. The affected element is a
   ghost in place meanwhile, so feedback is immediate while the numbers stay truthful.

## Alternatives considered

- **TanStack Query (Angular adapter)** — excellent, but it would outsource exactly the machinery this
  case asks to see engineered; a ~120-line purpose-built cache is fully tested and easy to reason about.
- **Optimistic writes with rollback** — they would show capacity and occupancy numbers the server may
  still reject; on a backend whose verdicts the forms must render, confirmed state is the honest
  choice, and the ghost already removes the perceived wait.
- **Service Worker caching** — the wrong layer for entity data with mutations; considered for static
  assets only.

## Consequences

- Perceived performance is decoupled from backend latency after the first load.
- The failure math flips: a screen with three calls goes from ~27% visible failure to under 0.1%.
- The cache introduces staleness risk — bounded by a short TTL, background revalidation and
  invalidate-or-write-through on every mutation.
