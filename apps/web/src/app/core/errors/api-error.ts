import { HttpErrorResponse } from '@angular/common/http';

/**
 * Error taxonomy (ARCHITECTURE §4.3) — every failure is classified once, here,
 * and every screen renders the class the same way:
 *
 * - `technical`  → transient 5xx / network. Retried by the interceptor; if it
 *                  still surfaces, error toast with retry affordance.
 * - `functional` → 4xx business/validation verdicts (e.g. overcrowding).
 *                  Never retried; rendered in context (inline on the form).
 * - `not-found`  → 404. Friendly empty-state page, not a toast.
 */
type ApiErrorKind = 'technical' | 'functional' | 'not-found';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isRetryable(): boolean {
    return this.kind === 'technical';
  }
}

const GENERIC_TECHNICAL_MESSAGE = $localize`Something went wrong on our side. Please try again.`;

/** Single place where raw HTTP failures become typed ApiErrors. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) {
    return err;
  }

  if (err instanceof HttpErrorResponse) {
    const status = err.status;
    const serverMessage = extractServerMessage(err.error);

    if (status === 404) {
      return new ApiError('not-found', serverMessage ?? $localize`Not found`, status, err);
    }
    if (status >= 400 && status < 500) {
      return new ApiError(
        'functional',
        serverMessage ?? $localize`The request was not accepted. Please review your input.`,
        status,
        err,
      );
    }
    return new ApiError('technical', GENERIC_TECHNICAL_MESSAGE, status, err);
  }

  return new ApiError('technical', GENERIC_TECHNICAL_MESSAGE, 0, err);
}

/**
 * The backend error shape varies (error-handler.ts vs zod validation):
 * `{ message }`, `{ error, details: [...] }`, or zod issue arrays. Normalize here.
 */
function extractServerMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const record = body as Record<string, unknown>;

  if (typeof record['message'] === 'string' && record['message'].length > 0) {
    return record['message'];
  }

  const details = record['details'];
  if (Array.isArray(details) && details.length > 0) {
    const first: unknown = details[0];
    if (typeof first === 'string') {
      return first;
    }
    if (
      first &&
      typeof first === 'object' &&
      typeof (first as Record<string, unknown>)['message'] === 'string'
    ) {
      return (first as Record<string, string>)['message'];
    }
  }
  if (details && typeof details === 'object') {
    const issues = (details as Record<string, unknown>)['issues'];
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0] as Record<string, unknown>;
      if (typeof first['message'] === 'string') {
        return first['message'];
      }
    }
  }

  if (typeof record['error'] === 'string' && record['error'].length > 0) {
    return record['error'];
  }
  return null;
}
