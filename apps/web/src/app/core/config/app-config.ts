import { InjectionToken } from '@angular/core';

/**
 * Runtime configuration (CODING-GUIDELINES §2 — no magic numbers in code).
 * Values that could ever change live here, injected app-wide.
 */
export interface AppConfig {
  /** Base path all API calls are prefixed with (proxied to the Fastify backend). */
  readonly apiBaseUrl: string;
  /** Retry policy for transient technical failures (ADR-004). */
  readonly retry: {
    readonly maxAttempts: number;
    readonly baseDelayMs: number;
    readonly backoffFactor: number;
    readonly maxDelayMs: number;
  };
  /** Stale-while-revalidate cache tuning (ADR-004). */
  readonly cache: {
    readonly freshTtlMs: number;
  };
  /** Skeleton timing (DESIGN-SYSTEM §4): delay avoids flash, min display avoids blink. */
  readonly skeleton: {
    readonly appearDelayMs: number;
    readonly minDisplayMs: number;
  };
  readonly toastDurationMs: number;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  factory: (): AppConfig => ({
    apiBaseUrl: '/api',
    retry: {
      maxAttempts: 3,
      baseDelayMs: 250,
      backoffFactor: 3,
      maxDelayMs: 3000,
    },
    cache: {
      freshTtlMs: 30_000,
    },
    skeleton: {
      appearDelayMs: 150,
      minDisplayMs: 300,
    },
    toastDurationMs: 5000,
  }),
});
