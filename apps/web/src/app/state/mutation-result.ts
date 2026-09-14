import { type ApiError, toApiError } from '../core/errors/api-error';
import type { ToastStore } from '../core/errors/toast-store';

export type RequestStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Mutations resolve to a typed verdict so forms can render functional errors inline. */
export type MutationResult = { ok: true } | { ok: false; error: ApiError };

/**
 * One policy for a failed write, shared by every store: a technical
 * failure is toasted (no form can render it); a functional verdict goes
 * back to the form, rendered inline, never toasted.
 */
export function failMutation(err: unknown, toasts: ToastStore): MutationResult {
  const error = toApiError(err);
  if (error.kind === 'technical') {
    toasts.error(error.message);
  }
  return { ok: false, error };
}
