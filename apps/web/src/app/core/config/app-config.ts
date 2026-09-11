import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Application configuration — no magic numbers in code.
 * Values that could ever change live here, injected app-wide; deployment-
 * dependent values come from `environments/` and are swapped at build time.
 */
export interface AppConfig {
  /** Base path all API calls are prefixed with — the app's ONLY API address. */
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
  // Skeleton timing is presentation, not config: `--skeleton-delay` in
  // styles/_tokens.scss (the one skeleton engine owns when ghosts appear).
  readonly toastDurationMs: number;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  factory: (): AppConfig => ({
    apiBaseUrl: environment.apiBaseUrl,
    retry: {
      maxAttempts: 3,
      baseDelayMs: 250,
      backoffFactor: 3,
      maxDelayMs: 3000,
    },
    cache: {
      freshTtlMs: 30_000,
    },
    toastDurationMs: 5000,
  }),
});
