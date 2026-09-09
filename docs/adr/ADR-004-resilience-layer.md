# ADR-004: Client resilience layer (SWR cache + retry + optimistic writes)

**Status:** accepted · **Date:** 2026-09-09

## Context
The backend intentionally adds 200–2000 ms latency to every response and fails 10% of requests with a 500 (`slow-api.ts`, `random-errors.ts`). The case asks that UX not suffer, and its performance bonus asks for a way to speed up frequently used data.

## Decision
Three cooperating mechanisms, all in `core`, invisible to features:

1. **Retry interceptor** — functional `HttpInterceptorFn`; retries idempotent requests (GET always; writes are also safe here because the error plugin fires in `onRequest`, before any handler runs — documented, and revisited under real-backend assumptions in ADR-005) up to 3 times with exponential backoff + full jitter (base 250 ms, factor 3, cap 3 s). Retries only 5xx/network errors — never 4xx.
2. **QueryCache (SWR)** — keyed GET cache: fresh hit → instant, no request; stale hit → instant render + background revalidate; miss → skeleton. TTL 30 s (config), identical in-flight requests de-duplicated, mutation-driven invalidation by key prefix.
3. **Optimistic mutations** — stores snapshot state, apply the change locally, fire the request; on definitive failure roll back and toast with retry. Functional 400s (overcrowding) skip optimism entirely — the form waits for the verdict.

## Alternatives considered
- **TanStack Query (Angular adapter)** — excellent, but it would outsource exactly the machinery this case wants to see engineered; a ~120-line purpose-built cache is more honest and fully tested.
- **Service Worker caching** — wrong layer for entity data with mutations; considered for static assets only.

## Consequences
- Perceived performance is decoupled from actual backend latency after first load.
- The failure math flips: a screen with 3 calls goes from ~27% visible failure to < 0.1% (three retries each).
- Cache introduces staleness risk — bounded by short TTL, revalidation, and invalidate-on-write.
