import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ApiError } from './api-error';
import { Logger } from '../logging/logger';
import { ToastStore } from './toast-store';

/**
 * Last line of defense: no error ever disappears
 * silently. Anything a screen didn't handle lands here — logged with context,
 * surfaced once as a toast for technical failures.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toasts = inject(ToastStore);
  private readonly logger = inject(Logger);

  handleError(error: unknown): void {
    const unwrapped = unwrapRejection(error);

    if (unwrapped instanceof ApiError) {
      if (unwrapped.kind === 'functional' || unwrapped.kind === 'not-found') {
        // Expected unhappy paths that escaped their screen — log, don't alarm.
        this.logger.warn(`api:${unwrapped.status}`, unwrapped.message);
        return;
      }
      this.logger.error(`api:${unwrapped.status}`, 'unhandled technical failure', unwrapped.cause);
      this.toasts.error(unwrapped.message);
      return;
    }

    this.logger.error('app', 'unhandled error', unwrapped);
    this.toasts.error($localize`Something unexpected happened. Please try again.`);
  }
}

function unwrapRejection(error: unknown): unknown {
  if (error && typeof error === 'object' && 'rejection' in error) {
    return (error as { rejection: unknown }).rejection;
  }
  return error;
}
