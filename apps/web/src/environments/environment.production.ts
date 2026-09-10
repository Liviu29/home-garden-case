/**
 * Production configuration.
 *
 * `apiBaseUrl` stays relative on purpose: the recommended deployment serves
 * the built SPA and reverse-proxies `/api/*` to the Fastify backend from the
 * same origin, which keeps cookies first-party and needs no CORS policy on a
 * backend that ships without one.
 *
 * Deploying the API on a different origin is the one supported alternative:
 * set the absolute origin here (e.g. `https://api.example.com`) and configure
 * CORS on the backend for the SPA's origin. This constant is the single place
 * that changes — see docs/PRODUCTION-READINESS.md.
 */
export const environment = {
  production: true,
  apiBaseUrl: '/api',
} as const;
