# ADR-009: Profiles own their gardens

**Status:** accepted · **Date:** 2026-09-11

## Context

The case's API has no link between a profile and a garden: every profile saw every garden.
With several profiles that reads as a bug — switch from Liviu to Maya and Maya sees Liviu's
orchard — and it is why deleting a profile had to explain that "gardens are shared".

This is a profile session, not authentication ([ADR-005](./ADR-005-authentication.md)): the goal
is a sensible product model, not access control. Anyone can still open any garden by its URL.

## Options

1. **Filter on the client** by a locally remembered owner — invisible to other devices, and the
   API would keep returning everyone's gardens.
2. **An owner column, filtered on the server** — the same kind of small, additive API change as
   `targetHumidityLevel` ([ADR-003](./ADR-003-backend-extension.md)).

## Decision

Option 2, additive and backwards compatible:

- **Migration 003** adds a nullable `garden.userId` (foreign key to `user`, indexed).
- **A new garden belongs to the profile that creates it.** The web app sends the signed-in
  profile's id; the API refuses an owner that does not exist with a 400, not a foreign-key 500.
- **`GET /gardens?visibleTo=<userId>`** returns that profile's gardens **plus the shared ones**
  (no owner). `GET /plants?visibleTo=<userId>` filters the plants the same way. Without the
  parameter both endpoints behave exactly as before.
- **Existing gardens stay shared** (`userId` null), so nothing disappears when the migration runs;
  the gardens grid marks them with a _Shared_ chip.
- **Deleting a profile hands its gardens back** as shared gardens. The service does this
  explicitly rather than relying on SQLite's foreign-key setting.
- **An edit never changes the owner**: the web app does not send it on `PUT`, and the API keeps
  the stored owner when the field is absent.

## Consequences

- Each profile sees its own gardens and the shared ones; the dashboard's totals only count the
  gardens on screen (the plants index is keyed by garden and can still hold another profile's).
- On a profile switch the gardens store drops the cached list instead of flashing the previous
  profile's gardens.
- The integration e2e suite signs in as a real profile it creates through the API, because the
  synthetic profile of the mocked suite does not exist server-side.
- Covered by `apps/api/src/app/routes/ownership.spec.ts` (filtering, owner validation, owner kept
  on update, release on delete) and by the stores' and API clients' unit tests.
