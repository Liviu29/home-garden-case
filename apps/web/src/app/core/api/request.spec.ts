import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ApiError } from '../errors/api-error';
import { requestAsPromise } from './request';

/**
 * The promise bridge's contract (CODING-GUIDELINES §5): a caller may `await`
 * it and catch `ApiError` — nothing raw ever escapes.
 */
describe('requestAsPromise', () => {
  it('resolves to the first emitted value', async () => {
    await expect(requestAsPromise(of({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('converts an HttpErrorResponse into a typed ApiError', async () => {
    const source$ = throwError(
      () => new HttpErrorResponse({ status: 500, error: { error: 'boom' } }),
    );
    await expect(requestAsPromise(source$)).rejects.toBeInstanceOf(ApiError);
    await expect(requestAsPromise(source$)).rejects.toMatchObject({ kind: 'technical' });
  });

  it('converts a non-HTTP throw into an ApiError too (nothing raw escapes)', async () => {
    const source$ = throwError(() => new TypeError('undefined is not a function'));
    await expect(requestAsPromise(source$)).rejects.toBeInstanceOf(ApiError);
  });
});
