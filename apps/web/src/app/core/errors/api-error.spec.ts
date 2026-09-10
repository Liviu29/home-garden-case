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

/**
 * Message extraction across every shape this backend actually emits. The
 * client renders whatever comes back verbatim for functional verdicts, so a
 * missed shape means a user sees a generic apology instead of the real reason
 * their plant was rejected.
 */
describe('ApiError message extraction — every observed payload shape', () => {
  const messageFor = (status: number, body: unknown): string =>
    toApiError(httpError(status, body)).message;

  it('reads `message`', () => {
    expect(messageFor(400, { message: 'Too big' })).toBe('Too big');
  });

  it('reads the first string in `details`', () => {
    expect(messageFor(400, { error: 'Validation Error', details: ['Name is required'] })).toBe(
      'Name is required',
    );
  });

  it('reads `message` off the first object in `details` (zod issue shape)', () => {
    expect(
      messageFor(400, { details: [{ path: ['gardenName'], message: 'Expected string' }] }),
    ).toBe('Expected string');
  });

  it('reads `details.issues[0].message`', () => {
    expect(messageFor(400, { details: { issues: [{ message: 'Invalid humidity' }] } })).toBe(
      'Invalid humidity',
    );
  });

  it('falls back to a non-empty `error` string', () => {
    expect(messageFor(400, { error: 'Bad Request' })).toBe('Bad Request');
  });

  it('ignores an empty `details` array', () => {
    const message = messageFor(400, { details: [] });
    expect(message).toBeTruthy();
  });

  it('ignores a `details` array whose first entry carries no message', () => {
    const message = messageFor(400, { details: [{ path: ['x'] }] });
    expect(message).toBeTruthy();
  });

  it('ignores an empty `issues` array', () => {
    const message = messageFor(400, { details: { issues: [] } });
    expect(message).toBeTruthy();
  });

  it('ignores an `issues` entry whose message is not a string', () => {
    const message = messageFor(400, { details: { issues: [{ message: 42 }] } });
    expect(message).toBeTruthy();
  });

  it('ignores an empty `error` string', () => {
    const message = messageFor(400, { error: '' });
    expect(message).toBeTruthy();
  });

  it('handles a body that is not an object at all', () => {
    expect(messageFor(400, 'plain text')).toBeTruthy();
    expect(messageFor(400, null)).toBeTruthy();
  });

  it('never leaks a 5xx body to the user, whatever shape it has', () => {
    const error = toApiError(httpError(503, { message: 'sqlite: disk I/O error at /var/db' }));
    expect(error.kind).toBe('technical');
    expect(error.message).not.toContain('sqlite');
  });

  it('passes an existing ApiError straight through', () => {
    const original = toApiError(httpError(404, { message: 'gone' }));
    expect(toApiError(original)).toBe(original);
  });

  it('classifies a network failure (status 0) as technical and retryable', () => {
    const error = toApiError(httpError(0, null));
    expect(error.kind).toBe('technical');
    expect(error.isRetryable).toBe(true);
  });
});
