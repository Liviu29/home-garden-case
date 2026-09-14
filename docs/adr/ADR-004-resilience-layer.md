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
   3, cap 3 s). Reads, PUTs and DELETEs are idempotent by definition. A POST is retried only when
   it carries an idempotency key — see the addendum below, which is what makes that safe.
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

## Addendum (2026-09-14): writes are retried with idempotency keys, not blindly

The first version retried every write, on the argument that the injected 500 fires in
`onRequest`, before any handler runs, so a failed write had never reached the database. That
argument covered the injected failures only. It did not cover a **network error** — the
connection dropping after the handler ran, while the API held the response for its deliberate
200–2000 ms — nor a genuine 5xx thrown mid-handler. In both cases the retry of a `POST` could
create a second garden or plant. The retry interceptor did not look at the HTTP method at all.

Decision, in three parts:

1. **Every `POST` carries an `Idempotency-Key`** (`idempotencyKeyInterceptor`): one UUID per
   logical attempt, stamped before the retry interceptor, so the re-sends carry the same key.
2. **The API remembers a completed `POST` by its key** (`apps/api/src/app/plugins/idempotency.ts`,
   [ADR-003](./ADR-003-backend-extension.md)) and answers a repeat from memory — same status, same
   body, `Idempotency-Replayed: true` — instead of running the handler again. A key is scoped to
   its method and URL; only 2xx responses are remembered, for ten minutes.
3. **The retry interceptor repeats only what is safe to repeat**: idempotent methods, and a `POST`
   that carries a key. A `POST` without one is sent once, whatever fails.

The stores add the last layer: a create or update called while the same one is in flight
**joins it** and receives its verdict, so a double-clicked Save, or a form racing a toast action,
is one request rather than two (`GardensStore`, `GardenDetailStore`).

Consequence: the frontend keeps the same silent recovery the case asks for, and the guarantee no
longer depends on where the API happens to inject its failures. The idempotency store is in
memory, which fits one API process on one SQLite file; several instances would move it into the
database.
