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
