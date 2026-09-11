# Performance & Caching

> Scope note: the frontend cannot make this API faster. Every technique below
> improves **perceived** performance and **request count** — never server time.
> Where the honest fix is server-side it is named as such.
> Decision record: [ADR-004](../adr/ADR-004-resilience-layer.md).
> Contract inventory: [API-INTEGRATION.md](./API-INTEGRATION.md).

## Current backend behaviour

Read from the source, not from the README ([API-INTEGRATION §2](./API-INTEGRATION.md#2-the-backend-at-a-glance)):

| Mechanism          | File                                        | Configuration                                                                                                   | Where it fires                                                    |
| ------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Artificial latency | `apps/api/src/app/plugins/slow-api.ts`      | `enabled: true`, uniform random `200–2000 ms`                                                                   | `onSend` — every route except `/docs*`, **after** the handler     |
| Failure injection  | `apps/api/src/app/plugins/random-errors.ts` | `errorRate: 10` (%), `statusCode: 500`, body `{error:"Internal server error", details:["Random error thrown"]}` | `onRequest` — every route except `/docs*`, **before** the handler |

Two consequences the frontend is built around:

1. The delay is `onSend`, so it is **added to every response including errors** — there is no fast path, and no amount of client work removes it.
2. The failure is `onRequest`, so an injected 500 happens **before any handler or DB write runs**. That is what makes blind retries safe _on this backend_ (and only on this one — production would need idempotency keys, ADR-005).

Additionally, the read surface has no shaping primitives at all: `GET /gardens` accepts **no querystring** (verified in `routes/gardens.ts` — `params` only), there is no `?include=plants`, no pagination, no sparse fieldsets, no `ETag`/`Last-Modified`, and no `Cache-Control`. `Garden` carries no plant array and no counts.

## Observed latency

Measured against the running backend, 60 sequential `GET /gardens` calls, this machine:

| Metric               | Value                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| Successful responses | 50 / 60                                                                |
| Injected 500s        | 10 / 60 (**16.7%** observed vs 10% configured — small-sample variance) |
| min                  | 307 ms                                                                 |
| p50                  | 1083 ms                                                                |
| p95                  | 1877 ms                                                                |
| max                  | 1936 ms                                                                |
| mean                 | 1101 ms                                                                |

The distribution matches the uniform `200–2000 ms` source exactly (theoretical mean 1100 ms; measured 1101 ms). **A single cold GET is a full second at the median.**

Compounded cost, uncached:

- Garden detail = 2 calls (`GET /gardens/{id}` + `GET /plants/garden/{id}`), issued in parallel → one latency draw, ~1.9 s at p95.
- Dashboard = `1 + N` calls (`GET /gardens`, then one `GET /plants/garden/{id}` per garden). The fan-out is **parallel**, so wall-clock is roughly the slowest draw (~2 s), not the sum — but the _request count_ is unbounded, because the API returns every garden with no pagination and no user scoping. A handful of gardens is a handful of calls; 150 gardens would be 151 requests, of which ~15 would be injected 500s.
- Failure math: a 3-call screen against a 10% failure rate fails visibly ~27% of the time. With 3 retries per call it drops below **0.1%**.

## Frontend mitigation

What we actually shipped, and what each thing does and does **not** buy:

### Stale-while-revalidate cache — `core/resilience/query-cache.ts`

Per-GET-key entries (`gardens`, `gardens:3`, `plants:garden:3`). Fresh (< 30 s) → rendered from memory, **zero requests, zero latency**. Stale → previous data painted immediately, network refresh in the background. Miss → skeleton. This is the only mechanism here that genuinely removes network time; it removes it by not going to the network.

### Retry interceptor — `core/http/api-interceptors.ts`

Exponential backoff with full jitter (250 ms base, ×3, 3 s cap, 3 retries), 5xx and network errors only — never a 4xx verdict. It converts a 27%-per-screen failure rate into <0.1%, at the cost of _adding_ latency on the unlucky path (a recovered request costs its own delay plus the backoff). That trade is correct: a slow success beats a fast error screen.

### Skeleton-first rendering — [ASYNC-UX.md](../design/ASYNC-UX.md)

Every GET paints a count-realistic, dimension-matched ghost; every mutation paints a gray ghost in place. **This does not make the API faster.** It replaces a blank second with a legible one, keeps layout shift at zero, and gives the eye a stable target so the 1-second median reads as "loading this" rather than "broken". A 150 ms appear delay keeps fast responses from flashing a skeleton, and there is no minimum display time: real data is never held back.

### Mutations: in-place ghosts, confirmed by the server

No write is optimistic. A create shows a ghost where the entity will land, an update grays out only the edited element, and a delete keeps the item visible and inert until the server confirms — then it leaves; on failure it resolves back with Try again. The ghost gives feedback at once while every number stays true to confirmed state. Create and update wait for the server on purpose: the capacity rule lives there and the form must render its answer.

### Rendering budget

Zoneless + OnPush + signals (change detection only where a signal changed); every route is a lazy `loadComponent` chunk; the Garden Map ships in its own `@defer (on viewport; prefetch on idle)` chunk behind a dimension-matched ghost — measured, its value here is the **lazy chunk boundary**, not delayed work: on a desktop viewport the map is above the fold, so the trigger fires immediately (the trigger is self-tuning — it genuinely defers only on viewports where the map starts off-screen), and the dimension-matched placeholder keeps CLS at 0.025 on a 1440×900 laptop and 0.000 on a 375×812 phone; stable `track` on every `@for`; capacity bars animate on `transform` only; self-hosted variable fonts with `font-display: swap`; icons inline. Production initial transfer ~130 kB gz, enforced by `angular.json` budgets — the build fails on regression. The two Highcharts charts follow the same rule: the library (about 158 kB transferred) is imported only when a chart scrolls into view (ADR-008).

## Cache invalidation

Keys come from one registry (`cacheKeys`), never ad-hoc strings, so invalidation cannot silently miss a caller.

| Mutation                        | Cache effect                                                                                                                      | Why                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /gardens`                 | write through `gardens` with the store's new list                                                                                 | the server returns the created garden, so the list is known exactly — a re-read would cost another 1 s for data we already hold                                                             |
| `PUT /gardens/{id}`             | write through **both** `gardens:{id}` (response body) and `gardens` (updated list)                                                | the server echoes the full updated row; both keys stay consistent without a network round trip                                                                                              |
| `DELETE /gardens/{id}`          | write through `gardens`, **invalidate** `gardens:{id}` and `plants:garden:{id}`                                                   | verified: the backend cascades — the garden's plants really are gone (a later `GET /plants/{plantId}` answers 404), so those keys must not survive as stale hits for resources that now 404 |
| `POST` / `PUT` / `DELETE` plant | `PlantsIndexStore.setPlants()` — one write that updates the cross-feature index **and** writes through `plants:garden:{gardenId}` | occupancy on the dashboard and gardens grid must agree with detail the moment detail changes, with no refetch                                                                               |

Two deliberate rules:

- **Write through when the server handed us the resource; invalidate when it did not.** Every write-through above stores a value the API actually returned (or a list rebuilt from such values) — never a row reconstructed from form input. Reconstruction would drift on fields the client does not own: `updatedAt` is the real example — the backend never touches it, so a locally invented value would be _more_ wrong than the row we already have.
- **Invalidate, never write through, on delete's dependents.** A deleted garden's detail and plant keys are the one case where the correct cached value is "nothing" — leaving them would serve a stale hit for a resource that now answers 404.

Freshness is 30 s. That is a product choice, not a technical one: garden data changes at human speed, and a 30-second window turns the common "detail → back → detail" loop into zero requests.

## Request de-duplication

The cache stores the in-flight promise, not just the settled value, so **identical concurrent GETs collapse into one request**. This matters specifically here:

- The dashboard and the gardens grid both declare a garden-id source to `PlantsIndexStore.ensureForGardens(...)`, which owns the fan-out. Without de-duplication, navigating between them mid-flight would double it. A cold session issues exactly one request per resource, client-side navigation with a fresh cache issues **zero**, and hover-prefetch followed by a click collapses to one — all asserted by `request-ownership.spec.ts`.
- Hover-prefetch (below) and the subsequent real navigation ask for the same key within milliseconds. De-duplication is what makes prefetch free rather than a doubled request.
- `GardenDetailStore` additionally guards **ordering**, not just count: each `load()` takes a monotonic token and a response whose token is stale is discarded. De-duplication prevents duplicate work; the token prevents garden A's slow response from overwriting garden B's screen — a real hazard when responses take up to 2 seconds and the user can click faster than that.

## Prefetch

`features/gardens/prefetch-garden/prefetch-garden.ts` warms `gardens:{id}` and `plants:garden:{id}` through the same SWR cache on hover/focus of a garden card. On a 1-second-median API this is the difference between a skeleton and an instant screen, and it costs nothing extra when the user does click (de-duplication) — at most one wasted pair of requests when they do not. Route chunks are prefetched separately by `@defer (prefetch on idle)` and Angular's lazy loading, so code and data arrive in parallel.

Prefetch is deliberately **not** applied to the dashboard's `1 + N` fan-out: warming every garden's plants on hover would trade a perceived-latency win for a request storm on a rate-limit-free hobby API. The right fix for that shape is server-side.

## Production backend improvements

Ranked by what would actually move the numbers above:

1. **Turn off the injected latency and failures.** Stated for completeness — they are a deliberate exam fixture, not a bug. Everything below assumes a real backend.
2. **An aggregate read model for the dashboard** — `GET /gardens?include=plants`, or a BFF `/dashboard` endpoint returning gardens with plant counts and occupied area. This removes the `1 + N` entirely; it is the single highest-value change, and no client technique can substitute for it.
3. **Pagination + user scoping on `GET /gardens`** (`?userId=`, `?page=`, `?limit=`). The endpoint currently returns every garden in the database to every profile, which is both a scaling problem and the reason profile deletion has to explain that gardens are shared.
4. **`ETag` / `If-None-Match` on list and detail reads.** Revalidation becomes a 304 with no body — SWR's background refresh would cost almost nothing.
5. **`Cache-Control` on stable resources**, plus a CDN/edge cache where deployment allows.
6. **Sparse fieldsets** (`?fields=`) so the dashboard can ask for occupancy without full plant rows.
7. **Idempotency keys on mutations**, so retry stays safe once errors can occur _mid-handler_ rather than only in `onRequest` (ADR-005).
8. **A server-side capacity check on `PUT /gardens/{id}`.** Verified missing: shrinking a garden below its occupied area returns 200 today. The client warns; the server should refuse.
9. **Server-side cache (e.g. Redis) for hot aggregates**, invalidated on write.
10. **Telemetry**: Web Vitals plus API-latency percentiles, so the budgets in this document stay measured rather than remembered.
