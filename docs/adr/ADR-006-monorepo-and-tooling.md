# ADR-006: Frontend inside the Nx monorepo; Vitest; hand-rolled API types

**Status:** accepted · **Date:** 2026-09-09

## Monorepo

The provided repo is an Nx 22 workspace and the README invites adding the frontend to it. We generate `apps/web` beside `apps/api`: one clone, one install, `npx nx dev api` + `npx nx dev web` for reviewers; shared prettier/eslint/tsconfig; `nx run-many -t lint test build` as the single quality gate. A separate repo would double reviewer setup for zero benefit.

## Test runner

**Vitest** via the Nx Angular generator (`unitTestRunner: vitest`) — fast, ESM-native, first-class fake timers (needed for backoff/cache TTL specs). Karma is deprecated; Jest gains us nothing here.

## API client typing

Options: openapi-generator from `/docs` JSON vs hand-written DTO types + mappers. The contract is 3 small resources whose zod schemas we read directly; a generator adds a build step and generated-code noise disproportionate to ~15 endpoints. **Decision:** hand-written `*.dto.ts` mirroring the zod schemas (each type annotated with its source schema), pure mapper functions, and a comment discipline that any contract change updates both sides. On a larger contract we would flip to `openapi-typescript` generation — the seam (mappers) is already in place.

## Two TypeScript versions — deliberate, and currently unavoidable

The workspace resolves **two** TypeScript versions. That is not accidental
version skew: the installed toolchain makes a single version impossible.

| Package                        | Declared peer range         | Consequence                                 |
| ------------------------------ | --------------------------- | ------------------------------------------- |
| `@angular/compiler-cli@22.1.5` | `typescript >=6.0 <6.1`     | `apps/web` **must** be on 6.0.x             |
| `typescript-eslint@8.46.2`     | `typescript >=4.8.4 <6.0.0` | the workspace linter **must not** be on 6.x |

The ranges do not intersect. So `apps/web` pins `~6.0.2` (Angular's compiler)
while the workspace root pins `~5.9.2` for ESLint and the API's esbuild-based
build. Both are hoisted correctly by npm workspaces — `apps/web/node_modules`
carries the 6.0.x copy the Angular compiler resolves, everything else resolves
the root 5.9.x.

**Revisit when** `typescript-eslint` ships a major that supports TypeScript 6;
at that point the root pin moves to 6.0.x and the split disappears. Until then,
collapsing to one version would put one of the two tools outside its supported
range for no benefit.
