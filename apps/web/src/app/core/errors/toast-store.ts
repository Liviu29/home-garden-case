import { Injectable, computed, inject, signal } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  /** Optional action (e.g. "Try again") — error toasts persist until dismissed. */
  readonly actionLabel?: string;
  readonly action?: () => void;
}

/**
 * App-wide notification queue (UX standard: every mutating success confirms,
 * technical errors surface once, with a retry affordance where retrying makes sense).
 */
@Injectable({ providedIn: 'root' })
export class ToastStore {
  private readonly config = inject(APP_CONFIG);
  private readonly _toasts = signal<readonly Toast[]>([]);
  private nextId = 1;

  readonly toasts = computed(() => this._toasts());

  success(message: string): void {
    this.push({ tone: 'success', message }, true);
  }

  info(message: string): void {
    this.push({ tone: 'info', message }, true);
  }

  /** Error toasts persist until dismissed (DESIGN-SYSTEM §6). */
  error(message: string, action?: { label: string; run: () => void }): void {
    this.push(
      { tone: 'error', message, actionLabel: action?.label, action: action?.run },
      false,
    );
  }

  dismiss(id: number): void {
    this._toasts.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  private push(toast: Omit<Toast, 'id'>, autoDismiss: boolean): void {
    const id = this.nextId++;
    this._toasts.update((toasts) => [...toasts, { ...toast, id }]);
    if (autoDismiss) {
      setTimeout(() => this.dismiss(id), this.config.toastDurationMs);
    }
  }
}
