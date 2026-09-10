# Coding Guidelines — `apps/web`

The working agreement for this codebase. Derived from battle-tested guidelines used on a previous large Angular programme, trimmed and modernised for Angular 22 and the shape of this case. When code and this doc disagree, fix one of them in the same PR.

## 1. Target stack

- **Angular 22**, standalone components only (no NgModules — folders group, not modules).
- **Zoneless** change detection — Angular 22's default, so no provider call is needed (and none is made); verified by `zone.js` being absent from the workspace and the production bundle. All components `ChangeDetectionStrategy.OnPush`.
- **TypeScript strict** + `noImplicitOverride`, `noFallthroughCasesInSwitch`, `strictTemplates`. Never switch these off to "make it compile".
- **SCSS** for styles, **typed Reactive Forms**, **signals + NgRx SignalStore** for state.
- Package manager: npm, `package-lock.json` committed.

## 2. File & naming conventions

- No `.component`/`.service` suffixes in filenames: `garden-list.ts`, `garden-list.html`, `garden-list.scss`, `garden-list.spec.ts` co-located in one folder (current Angular schematic default).
- Class names still descriptive: `GardenListStore` beats `GardensManager`. Clear naming over short naming.
- Domain models get plain names (`Garden`, `Plant`); generated/API DTO types are suffixed `Dto`. Mapping functions are pure: `mapToGarden(dto: GardenDto): Garden` in `core/api/mappers`.
- Booleans read as predicates: `isLoading`, `hasPlants`, `canAddPlant`.
- No magic numbers: limits live in `core/config` (`RETRY_POLICY`, `CACHE_TTL_MS`) — runtime configuration over constants where it could ever change.

## 3. Components

- `inject()` at field-declaration time; no constructor injection.
- Components are thin: template + view-model signals from a store. No HTTP in components, ever.
- Inputs/outputs via `input()` / `output()` signal functions; `model()` for two-way where warranted.
- New control flow only: `@if`, `@for` (always with `track`), `@switch`, `@defer`. Never `*ngIf`/`*ngFor`.
- Self-closing tags for components without projected content: `<app-skeleton-card />`.
- Break non-trivial template logic into `computed()` signals — no clever inline expressions.
- `shared/ui` components are presentational: inputs in, outputs out, zero store/HTTP awareness.

## 4. State (signals + SignalStore)

- Private writable state, public readonly: SignalStore's `withState` is deep-readonly from the outside; expose derived data with `withComputed`, writes only through `withMethods`.
- **Immutability by default**: `patchState` with new references (`[...list, item]`), never in-place mutation — zoneless rendering depends on it.
- One state pattern app-wide. No second mechanism (no BehaviorSubject state services) sneaking in beside SignalStore.
- Async flows in store methods use `rxMethod` or plain async methods pairing `status: 'loading'` with a `finally` reset — never rely on the happy path to clear a loading flag.
- Keep _state_ in signals and _event orchestration_ in RxJS where RxJS earns it (debounce, polling); don't rebuild stream machinery with `effect()`.

## 5. HTTP & resilience

- Features never call `HttpClient` directly — they call typed API services (`core/api`), which return domain models.
- Retry/backoff lives in one functional interceptor; caching/de-dup in `core/resilience`. A feature adding its own retry logic is a review blocker.
- Every service call renders one of: cached data, skeleton, empty-state, or error-state. A frozen or blank screen is a bug.
- `catchError` maps to a typed `ApiError` (functional vs technical, see ARCHITECTURE §4.3); calls resolve to a typed result, always.

## 6. Forms & validation

- Typed `FormGroup<...>` built with `NonNullableFormBuilder`.
- **Validation limits mirror the backend zod contract exactly** (same numbers, same cross-field rules — lat/lng together, humidity 0–100). When a rule changes on one side it changes on both; each validator carries a comment pointing at the schema it mirrors.
- Client-side overcrowding check gives instant feedback (remaining m² shown live); the server verdict remains authoritative and its message renders inline when returned.
- Validate on input, not only on submit; show remaining-capacity/character hints proactively.
- Submit buttons: disabled only for _invalid_, never for _pending_ — pending shows inline progress on the button itself.

## 7. Errors, logging & UX standard

- One global `ErrorHandler` + one HTTP error interceptor: no error ever disappears silently.
- Functional errors render in context (form field / inline message); technical errors use the shared error toast with retry; 404 deep links get the friendly not-found page; empty results get the shared `empty-state` component. Screens never invent their own pattern.
- Every mutating success confirms with the shared toast, action-specific text.
- Destructive actions (delete garden/plant) always confirm via the shared dialog — non-destructive actions never do.
- Log with context (operation, id), never payload dumps; `warn/info` for expected unhappy paths, `error` only for true technical failures.

## 8. Styling & accessibility

- Design tokens (CSS custom properties) in `shared/styles` — components consume tokens, never hard-code colors/spacing. See [DESIGN-SYSTEM.md](./design/DESIGN-SYSTEM.md).
- Font sizes and type-scale spacing in `rem`, not `px`.
- Component styles scoped; no `::ng-deep`. Shared components expose CSS custom properties for theming.
- Every interactive element keeps a visible focus state; dialogs/menus come from Material = a11y for free, don't break it.
- State communicated in text + icon, never color alone; lists announce updates politely (`aria-live`) where content streams in.
- Respect `prefers-reduced-motion`: animation presets collapse to opacity-only.

## 9. Testing

- `.spec.ts` co-located with the unit it tests.
- Every store/service with non-trivial logic gets a spec; priority order: resilience layer → domain rules (occupancy, validators) → stores → component behaviour.
- Component tests assert what a user notices (right thing renders, right event fires), not implementation internals.
- Timers/polling tested with fake timers — never real waits.
- Boy-scout rule: touching poorly tested code means leaving it better tested than you found it.

## 10. Git & reviews

- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), small and logical — the case explicitly reviews commit history. One concern per commit; docs land before the code that implements them.
- Definition of Done: lint + prettier clean, strict TS no new `any`, states wired (loading/empty/error), validation mirrors contract, specs cover new logic, bundle budget passes, keyboard walk-through works.
