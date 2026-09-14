# ADR-006: Frontend inside the Nx monorepo; Vitest; hand-rolled API types

**Status:** accepted · **Date:** 2026-09-09

## Monorepo

The provided repo is an Nx 22 workspace and the README invites adding the frontend to it. We generate `apps/web` beside `apps/api`: one clone, one install, `npx nx dev api` + `npx nx dev web` for reviewers; shared prettier/eslint/tsconfig; `nx run-many -t lint test build` as the single quality gate. A separate repo would double reviewer setup for zero benefit.

## Test runner

**Vitest** via the Nx Angular generator (`unitTestRunner: vitest`) — fast, ESM-native, first-class fake timers (needed for backoff/cache TTL specs). Karma is deprecated; Jest gains us nothing here.

## API client typing

Options: openapi-generator from `/docs` JSON vs hand-written DTO types + mappers. The contract is 3 small resources whose zod schemas we read directly; a generator adds a build step and generated-code noise disproportionate to ~15 endpoints. **Decision:** hand-written `*.dto.ts` mirroring the zod schemas (each type annotated with its source schema), pure mapper functions, and a comment discipline that any contract change updates both sides. On a larger contract we would flip to `openapi-typescript` generation — the seam (mappers) is already in place.

## One TypeScript version

The workspace is on **one** TypeScript version, 6.0.x, at the root and in
`apps/web`.

| Package                        | Declared peer range         | Consequence                     |
| ------------------------------ | --------------------------- | ------------------------------- |
| `@angular/compiler-cli@22.1.6` | `typescript >=6.0 <6.1`     | `apps/web` **must** be on 6.0.x |
| `typescript-eslint@8.70`       | `typescript >=4.8.4 <6.1.0` | the linter supports 6.0.x       |

Until typescript-eslint supported TypeScript 6, the root stayed on 5.9 for the
linter and the API while `apps/web` used 6.0, which left two copies of the
Angular toolchain in the tree. Storybook's Angular framework needs that
toolchain at the root, so the root moved to 6.0 when typescript-eslint caught
up. `@nx/eslint-plugin` still ships its own 5.9 copy for its rules; nothing
compiles with it.

**Revisit when** Angular widens its range to TypeScript 6.1: both pins move
together.

## Approved install scripts

npm 11 asks a project to approve the install scripts its dependencies run
(`allowScripts` in the root `package.json`) and warns about the rest. Eight
are approved: better-sqlite3, which fetches or builds its native SQLite
binary in that step, and seven tools that fetch a platform binary or set up
their CLI (esbuild, @swc/core, lmdb, msgpackr-extract, @parcel/watcher,
unrs-resolver, nx). They are approved by name, not version, so an upgrade
keeps its approval. A new dependency with an install script shows up in
`npm install-scripts ls`, to be approved on purpose or not at all.
