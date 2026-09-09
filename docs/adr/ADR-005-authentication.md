# ADR-005: Authentication — shipped mock session + designed real auth

**Status:** accepted · **Date:** 2026-09-09

## Context
The API has full `/users` CRUD but no authentication; gardens have no owner. The case's bonus invites a (theoretical) robust login/registration design, with API changes allowed.

## Decision — what we ship
A **profile session flow** on the real `/users` API: an onboarding screen lists profiles (create one inline), selecting one establishes a session in `SessionStore` (persisted to localStorage), a route guard sends session-less visitors to onboarding, and the shell shows the active profile with a switch/sign-out menu. This exercises real UX surface (guards, session state, personalization) without pretending to be security.

## Design — real auth (not built, would be the next epic)

**Server:** `POST /auth/register` (email + Argon2id-hashed password), `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`. Session via **httpOnly, Secure, SameSite=Lax cookie** (server-side session table) — chosen over header JWTs for a browser app: immune to XSS token theft, trivial revocation. If statelessness were required: short-lived access JWT (5 min) + rotating refresh token in httpOnly cookie with reuse detection. Add `ownerId` FK to gardens; every garden/plant query scoped to the authenticated user (row-level authorization in services, not just route guards). Rate-limit auth endpoints; add **idempotency keys** on writes so client retries stay safe once errors can occur mid-handler.

**Client:** auth interceptor handles 401 → redirect to login with return-URL; `canMatch` guards on all feature routes; `SessionStore` hydrates from `/auth/me` at bootstrap (`provideAppInitializer`); CSRF covered by SameSite + custom header check; login/registration as typed reactive forms with the same contract-mirroring validation used app-wide.

## Consequences
- Reviewers see working session UX today and a defensible production path in writing.
- The mock flow's `SessionStore`/guard/interceptor seams are exactly where real auth would plug in — minimal rework.
