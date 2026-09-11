# Production Readiness

What is configured, what is deliberately _not_, and how a release candidate is
verified. Companion reading: [ARCHITECTURE.md](./architecture/ARCHITECTURE.md) ·
[PERFORMANCE-AND-CACHING.md](./architecture/PERFORMANCE-AND-CACHING.md) ·
[API-INTEGRATION.md](./architecture/API-INTEGRATION.md).

## Baseline

|            |                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace  | Nx 22.0.2 monorepo, npm workspaces (`apps/*`), `package-lock.json` authoritative                                                                                                        |
| Frontend   | Angular 22.1.x — standalone, zoneless, signals, strict + `strictTemplates`                                                                                                              |
| Backend    | Fastify 5 + Kysely + better-sqlite3 (the case's own API, extended in small additive steps: [ADR-003](./adr/ADR-003-backend-extension.md), [ADR-009](./adr/ADR-009-garden-ownership.md)) |
| Node       | 22.22.3+ or 24.15+, pinned to 24.21.0 in `.nvmrc`. `engine-strict` stops `npm ci` early on any other version; Node 26 is out because better-sqlite3 12.4 stops at 24                    |
| TypeScript | 5.9 at the workspace root (Nx + API), 6.0 inside `apps/web` (Angular 22). Two pins on purpose — each project builds against the version its toolchain supports                          |

## Development configuration

| Concern     | Setting                                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One command | `npm run dev` → `nx run-many -t dev -p api web` (both continuous targets, one terminal)                                                                                                              |
| Frontend    | `npm run dev:web` — Angular dev server on `:4200`, `defaultConfiguration: development`                                                                                                               |
| Backend     | `npm run dev:api` — Fastify on `:3000`; `HOST`/`PORT` env overrides; Swagger UI at `/docs`                                                                                                           |
| API address | `proxy.conf.json` forwards `/api/*` → `http://localhost:3000` and strips the prefix. No app code names a host                                                                                        |
| Source maps | on (`sourceMap: true`), optimization off, named chunks on                                                                                                                                            |
| Database    | `db.sqlite` in the working directory, created by the migrator on first boot. Git-ignored. **A fresh clone starts empty**; `npm run seed` adds three demo profiles and eleven gardens through the API |

## Production configuration

`npm run build:web` → `apps/web/dist/web/browser` (`defaultConfiguration: production`).

| Concern        | Setting                                                                              | Why                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Optimization   | `optimization: true`                                                                 | explicit rather than inherited                                                                         |
| AOT            | always on (Angular 22 application builder)                                           | —                                                                                                      |
| Source maps    | `sourceMap: false`                                                                   | no `.map` files in the output. A monitoring setup would upload private maps instead of publishing them |
| Output hashing | `outputHashing: "all"`                                                               | immutable asset caching                                                                                |
| Named chunks   | `namedChunks: false`                                                                 | no source-path leakage in filenames                                                                    |
| Licenses       | `extractLicenses: true` → `3rdpartylicenses.txt`                                     | attribution ships with the bundle                                                                      |
| Environment    | `fileReplacements`: `environment.ts` → `environment.production.ts`                   | the one build-time switch                                                                              |
| Budgets        | initial 500 kB warn / **600 kB error**; `anyComponentStyle` 12 kB warn / 16 kB error | a real gate: the build _fails_ on a regression, it does not merely warn                                |

The built output contains **no `localhost` string, no source maps, no spec or fixture
files, no `.env` and no test reports.**

## API base URL strategy

One value, one place: `apiBaseUrl` in `src/environments/`, read by `APP_CONFIG`
(`InjectionToken`) and applied by `baseUrlInterceptor`. Services call
`http.get('/gardens')`; **no component, store or service knows a host.**

Both environments ship `'/api'` — a relative path — because the recommended
deployment serves the SPA and reverse-proxies `/api/*` to the backend from the
same origin. That keeps requests first-party and is why the provided backend
needs no CORS policy.

Deploying the API on a different origin is the one supported alternative: set
the absolute origin in `environment.production.ts` and enable CORS on the
backend for the SPA's origin. Deliberately **not** built: a runtime config
service that fetches `/config.json` at boot. It buys redeploy-free environment
switching this project has no use for, and costs a request before the first
paint on an API that answers in 200–2000 ms.

## Hosting requirements

The build is static files. A host must do exactly two things:

1. **SPA fallback** — serve `index.html` for unknown paths, or a hard refresh on
   `/gardens/1` returns a file-server 404. Client-side routing is an architectural
   choice ([ADR-001](./adr/ADR-001-angular-over-react.md)), and this is its hosting cost.
2. **Reverse-proxy `/api/*`** to the backend, stripping the `/api` prefix exactly as
   `proxy.conf.json` does in development.

Caching: `index.html` must be served `no-cache`; every other file is content-hashed
and can be `max-age=31536000, immutable`.

`tools/serve-dist.mjs` implements all three rules in ~90 dependency-free lines and
previews the production bundle locally (`node tools/serve-dist.mjs`). It is a
**preview harness, not a deployment target** — the repository ships no
platform-specific hosting configuration.

### Recommended security headers (deployment concern)

The repository contains no hosting configuration, so these are documented here for
whichever host serves the build:

- `Content-Security-Policy: default-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'` — the app inlines its critical CSS at build time, so a strict policy needs `style-src 'self' 'unsafe-inline'` or a build-time nonce.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`
- HSTS at the edge, once served over TLS.

## Backend configuration

The API is the case's own and is not re-architected. Facts as they stand:

- `HOST` / `PORT` env vars, defaulting to `localhost:3000`.
- SQLite file `db.sqlite` resolved relative to the working directory; migrations run at boot.
- **No CORS plugin** — consistent with the same-origin deployment above. A cross-origin deployment must add one.
- Swagger UI at `/docs`, advertising `http://localhost:${PORT}` as its server.
- Artificial latency (200–2000 ms) and 10 % random 500s are **deliberate exam fixtures**, enabled in `plugins/slow-api.ts` and `plugins/random-errors.ts`.

It is an assignment backend with no deployment story of its own, so no deployment
infrastructure is added for it. The frontend consequences are measured and documented
in [PERFORMANCE-AND-CACHING.md](./architecture/PERFORMANCE-AND-CACHING.md).

## Secrets

**None.** No API keys, tokens, passwords, credentials, `Authorization` headers or
private URLs exist anywhere in the repository, and no `.env` file is used, so there is
no `.env.example` either. Anything shipped to an Angular client is public by
definition, which is why the optional external plant provider is a documented
**seam** (`PlantCatalogProvider`) and not an integration: the shipped catalog is
local, deterministic and credential-free, and the app never depends on a third party.

Browser storage holds exactly three things, all non-sensitive and all safe-parsed:
the active profile (the mock-auth session, [ADR-005](./adr/ADR-005-authentication.md)),
the gardens list view preference, and versioned per-garden planner positions.

## Dependency security

`npm audit` findings sit in build tooling and in the provided backend — none in the
shipped browser bundle. `npm audit fix --force` is deliberately not run: it rewrites
major versions across the workspace.

| Where                  | What it is                                                                                                                                                  | Reaches the user?                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Shipped browser bundle | Runtime dependencies are `@angular/*`, `@ngrx/signals`, `rxjs`, `tslib`, `highcharts` and two self-hosted font packages; none appears in any advisory       | No                                 |
| Frontend build tooling | `esbuild`, `@babel/core`, `browserslist`, `picomatch`, `yaml`, `ajv`, `fast-uri` — compile-time only, never emitted                                         | No                                 |
| Nx / lint tooling      | `minimatch` / `brace-expansion` ReDoS reachable through `@nx/devkit`; fixed by Nx 22.7.x                                                                    | No — developer machines and CI     |
| Provided backend       | `fastify` (fixed in 5.12.3), `@fastify/static` via `@fastify/swagger-ui`, `kysely` (unsanitised JSON-path keys — this codebase builds no JSON-path queries) | Only if this backend were deployed |

Upgrade path: bump `fastify` to 5.12.x and `@fastify/swagger-ui`, then re-run the
integration e2e project; bump Nx to 22.7.x and re-run the full gate; then re-audit.
The backend upgrades are kept out of this deliverable because the provided API has no
test suite of its own to catch a regression in its latency and failure fixtures.

## Logging

`Logger` is the only console seam. Expected unhappy paths (`warn`) are silenced
outside dev mode; genuine technical failures (`error`) always report. Messages carry a
context tag and a human sentence — never a DTO, form value or profile field. Backend
5xx bodies never reach the user: the error taxonomy maps them to one generic sentence,
while 4xx business verdicts are shown verbatim because they tell the user exactly what
to change.

Observability is built in and off by default. The app measures its Core Web Vitals (LCP, INP,
CLS, plus FCP and TTFB) with `PerformanceObserver` and reports them through the same `Logger`.
Setting `telemetryEndpoint` in `environment.production.ts` sends technical errors and those
vitals to that URL with `navigator.sendBeacon` — batched, sent when the page is hidden, each
entry a context tag, a sentence or a number plus the route path, never a payload. Left `null`,
nothing leaves the browser. A Sentry or OpenTelemetry SDK would be one `LogSink` adapter provided
under `LOG_SINK`; call sites do not change.

## Verification gates

| Gate               | Command                                                                          | What it enforces                                                              |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Backend boots      | `npm run dev:api`                                                                | `/docs` answers 200                                                           |
| Lint               | `npm run lint`                                                                   | eslint + prettier across api, web and web-e2e                                 |
| Typecheck          | `npm run typecheck`                                                              | strict TypeScript + `strictTemplates`                                         |
| Unit / component   | `npm run test`                                                                   | the Vitest suite                                                              |
| Coverage           | `npm run test:coverage`                                                          | **≥95%** on statements, branches, functions and lines; the run fails below it |
| E2E deterministic  | `npx playwright test -c apps/web-e2e/playwright.config.ts --project=mocked`      | loading/empty/error states, ghosts, planner, axe scans, 375–1920 px layouts   |
| E2E real backend   | `npx playwright test -c apps/web-e2e/playwright.config.ts --project=integration` | the core flows against the real slow, flaky API                               |
| Production build   | `npm run build`                                                                  | bundle budgets                                                                |
| Spinner ban        | `npm run check:no-spinners`                                                      | no spinner components or classes anywhere in the app                          |
| Production preview | `node tools/serve-dist.mjs`                                                      | boot, routing, deep-link refresh and the `/api` proxy on the built bundle     |

The provided API ships no test suite of its own; its contract is exercised end to end
by the integration project.

### Production bundle

|                                     | Raw       | Transfer (gz) |
| ----------------------------------- | --------- | ------------- |
| **Initial total**                   | 498.21 kB | **133.17 kB** |
| `garden-detail` (lazy)              | 186.65 kB | 38.87 kB      |
| `garden-map` (lazy, `@defer`)       | 93.57 kB  | 21.49 kB      |
| `dashboard` (lazy)                  | 42.39 kB  | 10.67 kB      |
| `onboarding` (lazy)                 | 20.93 kB  | 5.70 kB       |
| `garden-list` (lazy)                | 14.96 kB  | 4.54 kB       |
| `profile-dialog` (lazy)             | 4.83 kB   | 1.85 kB       |
| Highcharts core (lazy, first chart) | 279.37 kB | 90.61 kB      |
| Highcharts accessibility (lazy)     | 137.16 kB | 35.06 kB      |
| `variwide` (lazy)                   | 4.04 kB   | 1.70 kB       |
| styles                              | 20.50 kB  | 4.23 kB       |

The one visualization dependency is Highcharts, for the two analytic charts, and it never ships in
the initial bundle: its three lazy chunks (about 127 kB transferred) are fetched in idle time on
the two screens that show a chart ([ADR-008](./adr/ADR-008-charts-highcharts.md)). There is no Three.js or WebGL
engine — the 3D mode was evaluated and declined with written rationale
([ADR-007](./adr/ADR-007-garden-visualization-engine.md)).

## Known considerations

1. **`GET /plants` is unpaginated.** The dashboard and the gardens grid read the plants of
   every visible garden in one request (it replaced one request per garden), scoped to the
   signed-in profile with `?visibleTo=` ([ADR-009](./adr/ADR-009-garden-ownership.md)) but,
   like `GET /gardens`, without paging. At the scale this app runs — a handful of gardens per
   profile — that is one small response; at thousands of plants it needs paging, server-side.
2. **Font subsets**: `@fontsource-variable` ships Cyrillic/Greek/Vietnamese `woff2` files
   alongside Latin. They are `unicode-range`-gated, so no browser downloads them for this
   app's content; trimming them would mean hand-writing `@font-face` blocks, which is not
   worth the maintenance cost.
3. **The e2e suite brings its own API and database.** Playwright starts a built API on
   `:3310` with a fresh SQLite file per run in the OS temp folder, so the integration
   project never writes into the `db.sqlite` you develop against. The run files are small
   and are not cleaned up automatically.
4. **No PWA, service worker or SSR.** None is part of the architecture, and adding one
   would introduce caching and hydration risk for no user benefit here. Deliberate CSR
   is recorded in ADR-001.
5. **CI** runs on GitHub Actions (`.github/workflows/ci.yml`) on every push to `main` and
   every pull request: lint, typecheck, the API tests, the web unit tests with the 95%
   coverage gate, the production build with its budgets, the spinner check, then every
   Playwright project in a second job (the report is uploaded when it fails). The case's
   original `.gitlab-ci.yml` is kept for GitLab.
6. **Highcharts licence**: free for non-commercial use, which covers this case; a commercial
   deployment needs a Highcharts licence, or a swap contained to the two chart option builders
   and `<app-chart>` ([ADR-008](./adr/ADR-008-charts-highcharts.md)).
