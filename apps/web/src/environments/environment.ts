/**
 * Development configuration (default; replaced at build time by
 * `environment.production.ts` — see angular.json `fileReplacements`).
 *
 * `apiBaseUrl` is relative so the Angular dev server's proxy
 * (`proxy.conf.json`) forwards `/api/*` to the Fastify backend on
 * `http://localhost:3000`. Nothing in the app ever names a host.
 */
export const environment = {
  production: false,
  apiBaseUrl: '/api',
  /** Errors and Web Vitals go to the console only; see environment.production.ts. */
  telemetryEndpoint: null as string | null,
} as const;
