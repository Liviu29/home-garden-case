# ADR-005: Authentication — a shipped profile session, and a designed production model

**Status:** accepted · **Date:** 2026-09-09

## Context

The API has full `/users` CRUD but no authentication, and gardens have no owner. The case's bonus
invites a robust (theoretical) login and registration design, with API changes allowed.

## Decision — what ships

A **profile session flow** on the real `/users` API: the welcome screen lists profiles and creates one
inline; selecting one establishes a session in `SessionStore` (persisted to `localStorage`); a
`canMatch` guard keeps session-less visitors on the welcome screen; the shell shows the active profile
with edit, switch, sign-out and delete. On boot the session is revalidated (`GET /users/{id}`): a 404
signs out, a transient 500 does not. No security is claimed — the value is that the seams (session
store, guard, interceptor slot) are exactly where real authentication plugs in.

## Design — production authentication (not built)

**Protocol.** OIDC / OAuth 2.1 **Authorization Code + PKCE** against a managed identity provider,
fronted by a **BFF**, so the SPA never holds tokens. The BFF exchanges the code, keeps tokens
server-side and gives the browser an **httpOnly, Secure, SameSite=Lax session cookie** — immune to
XSS token theft, with trivial revocation through a server-side session table. If statelessness were
required instead: a short-lived access JWT (≈5 min) plus a rotating refresh token in an httpOnly
cookie with reuse detection.

**Registration and login.** Hosted identity-provider pages over hand-rolled forms: password policy,
breach checks, MFA and rate limiting come from the provider. `POST /auth/logout` clears the server
session and cookie; provider-initiated logout propagates via back-channel.

**Session lifecycle.** A short idle timeout with sliding renewal; refresh handled by the BFF with
rotation. The SPA bootstraps through `GET /auth/me` (`provideAppInitializer`) to hydrate
`SessionStore`; a 401 anywhere routes to login with a return URL — an auth interceptor in the slot next
to the retry interceptor.

**CSRF.** SameSite=Lax plus a custom-header check on mutating routes; no state-changing GETs exist.

**Authorization.** An `ownerId` foreign key on gardens, and every garden and plant query scoped to the
session user **in the services** (row-level, not only route guards). Client-side guards and
`canX` computeds shape the UX, but the server enforces.

**Write safety.** Already in place ([ADR-004](./ADR-004-resilience-layer.md) addendum): every
`POST` carries an `Idempotency-Key`, the API de-duplicates by it, and the retry interceptor repeats
only idempotent requests and keyed `POST`s. A BFF would keep the same header and move the
de-duplication table behind it, where it can be shared by every API instance.

**Frontend deltas** (deliberately small): the auth interceptor, `SessionStore` hydration from
`/auth/me`, the existing guard as-is, and login/registration routes replacing the welcome screen.
Stores, cache and error taxonomy are already authentication-agnostic.

## Consequences

- Working session UX today, and a defensible production path in writing.
- Real authentication is a bounded change at known seams, not a rework.
