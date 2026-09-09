import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { retry, throwError, timer } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';

/**
 * Prefixes relative API paths with the configured base URL, so services write
 * `this.http.get('/gardens')` and stay ignorant of deployment topology.
 */
export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const { apiBaseUrl } = inject(APP_CONFIG);
  if (req.url.startsWith('http') || req.url.startsWith(apiBaseUrl)) {
    return next(req);
  }
  return next(req.clone({ url: `${apiBaseUrl}${req.url}` }));
};

/**
 * Transparent retry for transient technical failures (ADR-004).
 *
 * The backend fails ~10% of ALL requests with a random 500 *before* the route
 * handler runs (random-errors.ts hooks `onRequest`), so on this API even
 * non-idempotent writes are provably safe to retry. That guarantee is
 * documented here on purpose: against a real backend this policy would narrow
 * to idempotent methods + idempotency keys (see ADR-005).
 *
 * Policy: exponential backoff with full jitter — attempt n waits
 * random(0, min(base * factor^n, cap)). Only 5xx/network errors retry;
 * functional 4xx verdicts never do.
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  const { retry: policy } = inject(APP_CONFIG);

  return next(req).pipe(
    retry({
      count: policy.maxAttempts,
      delay: (error: unknown, retryCount: number) => {
        if (!isTransient(error)) {
          return throwError(() => error);
        }
        const expDelay = Math.min(
          policy.baseDelayMs * Math.pow(policy.backoffFactor, retryCount - 1),
          policy.maxDelayMs,
        );
        // Full jitter prevents synchronized retry storms.
        return timer(Math.random() * expDelay);
      },
    }),
  );
};

function isTransient(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status >= 500 || error.status === 0);
}
