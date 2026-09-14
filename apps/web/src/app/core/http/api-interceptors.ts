import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
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

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Methods the HTTP spec defines as idempotent: repeating one changes nothing further. */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'PUT',
  'DELETE',
]);

/**
 * Stamps every POST with an `Idempotency-Key` (ADR-004): one key per logical
 * attempt, kept across the retry interceptor's re-sends because they re-send
 * this same request. The API remembers a completed POST by its key and
 * answers a repeat from memory, so a retry after a dropped connection can
 * never create a second garden or plant. A caller that sets its own key
 * keeps it.
 */
export const idempotencyKeyInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'POST' || req.headers.has(IDEMPOTENCY_KEY_HEADER)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { [IDEMPOTENCY_KEY_HEADER]: newIdempotencyKey() } }));
};

/**
 * Transparent retry for transient technical failures (ADR-004).
 *
 * Only 5xx and network errors retry; a functional 4xx verdict never does.
 * Reads, PUTs and DELETEs are idempotent by definition. A POST is retried
 * only when it carries an idempotency key — every POST from this app does
 * (see `idempotencyKeyInterceptor`, which runs before this one), and the API
 * de-duplicates by that key — so a write that may already have landed is
 * never repeated blindly.
 *
 * Policy: exponential backoff with full jitter — attempt n waits
 * random(0, min(base * factor^n, cap)).
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  const { retry: policy } = inject(APP_CONFIG);
  if (!isSafeToRepeat(req)) {
    return next(req);
  }

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

function isSafeToRepeat(req: { method: string; headers: { has(name: string): boolean } }): boolean {
  return IDEMPOTENT_METHODS.has(req.method) || req.headers.has(IDEMPOTENCY_KEY_HEADER);
}

function isTransient(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status >= 500 || error.status === 0);
}

/** A UUID; the older getRandomValues path covers a test DOM without randomUUID. */
function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
