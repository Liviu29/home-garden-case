import { TestBed } from '@angular/core/testing';
import { ApiError } from './api-error';
import { GlobalErrorHandler } from './global-error-handler';
import { Logger } from '../logging/logger';
import { ToastStore } from './toast-store';

const apiError = (kind: ApiError['kind'], status: number, message: string): ApiError =>
  new ApiError(kind, message, status, 'raw');

/**
 * The last line of defence (CODING-GUIDELINES §7). Its job is triage: nothing
 * disappears silently, but only alarm-worthy things reach the user.
 */
describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let toasts: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = { warn: vi.fn(), error: vi.fn() };
    toasts = { error: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: Logger, useValue: logger },
        { provide: ToastStore, useValue: toasts },
      ],
    });
    handler = TestBed.inject(GlobalErrorHandler);
  });

  it('logs a functional verdict as a warning and does NOT toast it', () => {
    handler.handleError(apiError('functional', 400, 'Garden would be overcrowded'));

    expect(logger.warn).toHaveBeenCalledWith('api:400', 'Garden would be overcrowded');
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('treats a not-found the same way — expected, not alarming', () => {
    handler.handleError(apiError('not-found', 404, 'Garden not found'));

    expect(logger.warn).toHaveBeenCalledWith('api:404', 'Garden not found');
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('logs AND toasts a technical failure, passing the original cause to the log', () => {
    handler.handleError(apiError('technical', 500, 'Something went wrong'));

    expect(logger.error).toHaveBeenCalledWith('api:500', 'unhandled technical failure', 'raw');
    expect(toasts.error).toHaveBeenCalledWith('Something went wrong');
  });

  it('falls back to a generic message for a non-ApiError throw', () => {
    const boom = new TypeError('x is not a function');
    handler.handleError(boom);

    expect(logger.error).toHaveBeenCalledWith('app', 'unhandled error', boom);
    expect(toasts.error).toHaveBeenCalledWith('Something unexpected happened. Please try again.');
  });

  it('unwraps a zoneless unhandled promise rejection before triaging it', () => {
    // Angular wraps rejections as { rejection }. Without unwrapping, a
    // functional verdict would be misclassified as a technical failure and
    // shown to the user as an alarm.
    handler.handleError({ rejection: apiError('functional', 400, 'Too big') });

    expect(logger.warn).toHaveBeenCalledWith('api:400', 'Too big');
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('handles null without throwing', () => {
    expect(() => handler.handleError(null)).not.toThrow();
    expect(toasts.error).toHaveBeenCalled();
  });
});
