# Authentication Design

The case's auth bonus, answered in two parts: a **shipped** profile-session flow that exercises real session UX on the existing `/users` API, and the **production design** below. Decision record: [ADR-005](../adr/ADR-005-authentication.md).

## Shipped today (mock, honest about being mock)

Onboarding lists/creates profiles against `/users`; selecting one establishes a `SessionStore` session (localStorage-persisted), a `canMatch` guard keeps session-less visitors in onboarding, and the shell shows the active profile with switch/sign-out. No security is claimed — the value is that the seams (session store, guard, interceptor slot) are exactly where real auth plugs in.

## Production architecture

**Protocol.** OIDC / OAuth 2.1 **Authorization Code + PKCE** against a managed IdP (Auth0/Entra/Keycloak), fronted by a **BFF**: the SPA never holds tokens. The BFF exchanges the code, keeps tokens server-side, and gives the browser an **httpOnly, Secure, SameSite=Lax session cookie**. This kills XSS token theft, makes revocation trivial (server-side session table), and matches the repo's existing BFF-style layering (the frontend already talks only to its proxy).

**Registration & login.** Hosted IdP pages (brandable) over hand-rolled forms — password policy, breach checks, MFA and rate limiting come from the IdP. `POST /auth/logout` clears the server session and cookie; IdP-initiated single logout propagated via back-channel.

**Session lifecycle.** Short server-session idle timeout with sliding renewal; refresh handled BFF-side against the IdP with rotation + reuse detection. The SPA bootstraps via `GET /auth/me` in `provideAppInitializer`, hydrating `SessionStore`; a 401 anywhere routes to login with a return URL (auth interceptor — the slot next to the retry interceptor).

**CSRF.** SameSite=Lax + a custom-header check (`X-Requested-With`) on mutating routes; state-changing GETs don't exist.

**Authorization.** `ownerId` FK on gardens; every garden/plant query scoped to the session user **in the services** (row-level, not just route guards). Client-side: `canMatch` guards for routing UX and `store.canX` computeds for affordances — always duplicated server-side, never trusted alone. Roles (e.g. read-only viewer) as claims → route guards + disabled affordances.

**Write safety.** Once real handlers can fail mid-mutation, blanket write-retry becomes unsafe → **idempotency keys** on POST/PUT/DELETE (client sends a UUID per logical attempt; BFF dedupes), and the retry interceptor narrows to idempotent requests.

**Frontend deltas** (deliberately small): auth interceptor (401 → login redirect), `SessionStore.hydrate()` from `/auth/me`, guard reuse as-is, login/registration routes replacing onboarding. Everything else — stores, cache, error taxonomy — is auth-agnostic already.
