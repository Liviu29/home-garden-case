import { Observable, firstValueFrom } from 'rxjs';
import { toApiError } from '../errors/api-error';

/**
 * Bridges an HttpClient observable to a Promise with a hard guarantee
 * (CODING-GUIDELINES §5): calls resolve to typed results; failures always
 * surface as typed ApiErrors — never raw HttpErrorResponses.
 */
export async function requestAsPromise<T>(source$: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(source$);
  } catch (err) {
    throw toApiError(err);
  }
}
