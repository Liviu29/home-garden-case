# ADR-006: Frontend inside the Nx monorepo; Vitest; hand-rolled API types

**Status:** accepted · **Date:** 2026-09-09

## Monorepo
The provided repo is an Nx 22 workspace and the README invites adding the frontend to it. We generate `apps/web` beside `apps/api`: one clone, one install, `npx nx dev api` + `npx nx dev web` for reviewers; shared prettier/eslint/tsconfig; `nx run-many -t lint test build` as the single quality gate. A separate repo would double reviewer setup for zero benefit.

## Test runner
**Vitest** via the Nx Angular generator (`unitTestRunner: vitest`) — fast, ESM-native, first-class fake timers (needed for backoff/cache TTL specs). Karma is deprecated; Jest gains us nothing here.

## API client typing
Options: openapi-generator from `/docs` JSON vs hand-written DTO types + mappers. The contract is 3 small resources whose zod schemas we read directly; a generator adds a build step and generated-code noise disproportionate to ~15 endpoints. **Decision:** hand-written `*.dto.ts` mirroring the zod schemas (each type annotated with its source schema), pure mapper functions, and a comment discipline that any contract change updates both sides. On a larger contract we would flip to `openapi-typescript` generation — the seam (mappers) is already in place.
