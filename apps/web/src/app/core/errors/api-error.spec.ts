import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, toApiError } from './api-error';

const httpError = (status: number, body: unknown): HttpErrorResponse =>
  new HttpErrorResponse({ status, error: body });

describe('ApiError taxonomy (ARCHITECTURE §4.3)', () => {
  it('maps 5xx to technical (retryable, generic message — no stack traces to users)', () => {
    const error = toApiError(httpError(500, { error: 'Random error thrown' }));
    expect(error.kind).toBe('technical');
    expect(error.isRetryable).toBe(true);
    expect(error.message).not.toContain('Random error thrown');
  });

  it('maps 400 to functional and preserves the server verdict verbatim', () => {
    const message =
      "Cannot add plant: total surface area required (25m²) would exceed garden's total surface area (20m²)";
    const error = toApiError(httpError(400, { message }));
    expect(error.kind).toBe('functional');
    expect(error.isRetryable).toBe(false);
    expect(error.message).toBe(message);
  });

  it('maps 404 to not-found', () => {
    const error = toApiError(httpError(404, { message: 'Garden with ID 99 not found' }));
    expect(error.kind).toBe('not-found');
    expect(error.message).toBe('Garden with ID 99 not found');
  });

  it('extracts messages from the api error-handler shape ({ error, details })', () => {
    const error = toApiError(
      httpError(400, { error: 'Validation Error', details: ['Garden name is required'] }),
    );
    expect(error.message).toBe('Garden name is required');
  });

  it('extracts messages from zod issue payloads', () => {
    const error = toApiError(
      httpError(400, {
        error: 'Response Validation Error',
        details: { issues: [{ message: 'Target humidity level must be between 0 and 100' }] },
      }),
    );
    expect(error.message).toBe('Target humidity level must be between 0 and 100');
  });

  it('treats network failures (status 0) as technical', () => {
    const error = toApiError(httpError(0, null));
    expect(error.kind).toBe('technical');
  });

  it('passes existing ApiErrors through unchanged', () => {
    const original = new ApiError('functional', 'nope', 400);
    expect(toApiError(original)).toBe(original);
  });
});
