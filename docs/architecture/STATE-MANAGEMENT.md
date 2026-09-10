# State Management

Signals are the only reactive state primitive in components; NgRx SignalStore structures feature-level state. Full rationale for SignalStore over classic NgRx: [ADR-002](../adr/ADR-002-signalstore.md).

## Store inventory & ownership

| Store               | Scope                                                            | Owns                                                                    | Derives (computed, never stored)                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GardensStore`      | root                                                             | garden entities, request status, `saving`                               | `isLoading`, `hasFailed`, `isEmpty`, `count`                                                                                                                                                   |
| `PlantsIndexStore`  | root                                                             | **the single writable owner of all plant entities** (per gardenId)      | — (consumers derive; the detail store's `plants` is a computed view into it)                                                                                                                   |
| `GardenDetailStore` | **route-provided** (created/destroyed with the detail component) | one garden + the route's gardenId, statuses, `saving`, `pendingDeletes` | `plants` (a computed view into PlantsIndexStore — plant entities have exactly ONE writable owner, REM-005), `usedArea`, `freeArea`, `occupancy`, `avgHumidity`, `humidityDrift`, `plantsEmpty` |
| `SessionStore`      | root                                                             | active profile (localStorage-hydrated)                                  | `displayName`, `initials`, `isActive`                                                                                                                                                          |
| `ToastStore`        | root                                                             | notification queue                                                      | —                                                                                                                                                                                              |

Rules, enforced by review:

- **Derived state is never stored.** `usedArea`/`freeArea`/`utilization` are `computed()` from `garden + plants` — they cannot go stale, and the math lives in pure functions (`shared/utils/garden-insights.ts`), not in the store.
- **Immutable updates only** — `patchState` with fresh references. Zoneless + OnPush rendering depends on it.
- **One pattern app-wide.** No BehaviorSubject state services beside SignalStore; small self-contained state (Session, Toast) uses plain signal classes with the same private-writable/public-readonly shape.
- **Mutations return typed verdicts** (`MutationResult = {ok} | {ok:false, error: ApiError}`) so forms render functional errors inline without stores knowing about forms.

## Signals vs RxJS

Signals hold _state_; RxJS handles _events and I/O_: HTTP (through `HttpClient`), retry/backoff (`retry` + `timer` in the interceptor), promise bridging (`firstValueFrom`). We do not rebuild stream machinery with `effect()` — the few effects in the app are narrow: route-param → `store.load()`, gardens-list → progressive plant enrichment, count-up animation. No manual `subscribe()` calls exist outside RxJS-internal operators; the one place subscriptions could leak (dialogs) uses `firstValueFrom(ref.afterClosed())`.

## Async method pattern

Every async store method pairs its loading flag with a `finally` reset and maps failures through `toApiError` — a frozen loading state or a silently swallowed error cannot occur by construction. Optimistic flows snapshot → apply → await → (on failure) restore snapshot + toast with retry.

## What happens when…

- **…the user double-clicks Save?** `saving` is checked at method entry; the second submit returns immediately (proven by mocked e2e Flow 10: one POST for three clicks). Deletes carry per-entity `pendingDeletes` guards so a retry during an in-flight retry is a no-op (REM-009).
- **…two loads race?** The QueryCache de-duplicates identical in-flight GETs into one promise; both callers resolve together.
- **…the user navigates away mid-load?** Root stores keep the (still valid) result in the cache; the route-scoped `GardenDetailStore` is destroyed with its route, and its late resolutions patch a dead store — harmless, no rendering, GC'd.
- **…after refresh?** Session rehydrates from localStorage; entity caches are memory-only by design (30 s TTL makes persistence pointless), so data re-fetches through the skeleton-first path.
