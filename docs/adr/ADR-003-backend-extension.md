# ADR-003: Extend the backend with `targetHumidityLevel` on Garden

**Status:** accepted · **Date:** 2026-09-09

## Context

The functional requirements demand _"Each garden should have a configurable target humidity level (range: 0-100)"_, but the provided API has no such field on Garden (verified in `garden.schema.ts`, `migration001.ts`, `database/types.ts`). Plants have `idealHumidityLevel`; gardens do not have a target. The case explicitly permits API changes ("you are free to make those changes").

## Options

1. **Frontend-only storage** (localStorage keyed by gardenId) — no API change, but data is device-bound, invisible to other clients, and lies about the system's shape.
2. **Extend the API** — add the column + schema field; the requirement becomes real, and validation lives server-side where it belongs.

## Decision

Extend the API minimally: `targetHumidityLevel real not null default 50` in the migration, `z.number().min(0).max(100)` in create/update/response schemas. Default 50 keeps existing rows and clients valid; OpenAPI docs update automatically from the zod registry.

## Consequences

- Honors the requirement properly and shows comfort crossing the stack boundary.
- The dashboard's humidity-vs-target insights (plant `idealHumidityLevel` vs garden target) become meaningful.
- Change is deliberately tiny and isolated to one commit so reviewers can audit it in seconds.

## Addendum (2026-09-11): three more small changes, and tests

Two gaps found while integrating were closed on the server, where they belong, and the API got
its own tests:

1. **`GET /plants`** returns every plant in one request. The dashboard and the gardens grid used
   to need `1 + N` requests (one `GET /plants/garden/{id}` per garden); `PlantsIndexStore` now
   makes one. The per-garden endpoint is unchanged.
2. **Capacity on `PUT /gardens/{id}`.** The capacity rule was only enforced when plants changed,
   so a garden could be shrunk below the area its plants use. `GardenService.updateGarden` now
   refuses that with the same 400 `Validation error` shape the plant rule uses.
3. **Two environment switches for tests**, both off by default so the running API behaves exactly
   as the case describes: `DB_PATH` picks the SQLite file (`:memory:` in tests) and
   `API_CHAOS=off` disables the injected delays and 500s.

`apps/api` now has Vitest tests (`nx test api`) that boot the real app — every route, plugin,
schema and migration — against an in-memory database through Fastify's `inject()`: CRUD for all
three resources, validation errors, 404s, the cascade, and the capacity rule in both directions.

## Addendum (2026-09-14): idempotent POSTs

4. **`Idempotency-Key` on `POST`** (`plugins/idempotency.ts`). A completed `POST` is remembered by
   the key it carried, scoped to its URL, for ten minutes; repeating it returns the first response
   (`Idempotency-Replayed: true`) instead of a second row. This is what lets the frontend retry a
   `POST` whose answer never arrived ([ADR-004](./ADR-004-resilience-layer.md)). Without the header
   the API behaves exactly as before. Tested in `plugins/idempotency.spec.ts`.
