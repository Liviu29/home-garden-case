import { Injectable, computed, inject, signal } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  /** Optional action ("Try again", "Undo"). */
  readonly actionLabel?: string;
  readonly action?: () => void;
}

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

/** A toast's auto-dismiss countdown. */
interface Countdown {
  handle: ReturnType<typeof setTimeout> | undefined;
  remainingMs: number;
  startedAt: number;
  /** Pointer and focus hold it independently; it runs only when neither does. */
  holds: number;
}

/** A toast with an action (Undo) stays twice as long: time to decide, not just to read. */
const ACTION_DURATION_FACTOR = 2;
/** A countdown that resumes never has less than this left. */
const MIN_RESUME_MS = 1500;

/**
 * App-wide notification queue (UX standard: every mutating success confirms,
 * technical errors surface once, with a retry affordance where retrying makes sense).
 */
@Injectable({ providedIn: 'root' })
export class ToastStore {
  private readonly config = inject(APP_CONFIG);
  private readonly _toasts = signal<readonly Toast[]>([]);
  private readonly countdowns = new Map<number, Countdown>();
  private nextId = 1;

  readonly toasts = computed(() => this._toasts());

  /** With an action (e.g. Undo) the toast stays up longer. */
  success(message: string, action?: ToastAction): void {
    const duration = this.config.toastDurationMs * (action ? ACTION_DURATION_FACTOR : 1);
    this.push(
      { tone: 'success', message, actionLabel: action?.label, action: action?.run },
      duration,
    );
  }

  info(message: string): void {
    this.push({ tone: 'info', message }, this.config.toastDurationMs);
  }

  /** Error toasts persist until dismissed (DESIGN-SYSTEM §6). */
  error(message: string, action?: ToastAction): void {
    this.push({ tone: 'error', message, actionLabel: action?.label, action: action?.run }, null);
  }

  /**
   * Pause a toast's countdown while the pointer is on it or focus is inside
   * it, so nobody loses an Undo while reaching for it (WCAG 2.2.1).
   */
  hold(id: number): void {
    const countdown = this.countdowns.get(id);
    if (!countdown) {
      return;
    }
    countdown.holds += 1;
    if (countdown.holds === 1) {
      clearTimeout(countdown.handle);
      countdown.remainingMs -= Date.now() - countdown.startedAt;
    }
  }

  /** Ends one hold; the countdown resumes once nothing holds it. */
  release(id: number): void {
    const countdown = this.countdowns.get(id);
    if (!countdown || countdown.holds === 0) {
      return;
    }
    countdown.holds -= 1;
    if (countdown.holds === 0) {
      this.start(id, countdown, Math.max(countdown.remainingMs, MIN_RESUME_MS));
    }
  }

  dismiss(id: number): void {
    clearTimeout(this.countdowns.get(id)?.handle);
    this.countdowns.delete(id);
    this._toasts.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  private push(toast: Omit<Toast, 'id'>, durationMs: number | null): void {
    const id = this.nextId++;
    this._toasts.update((toasts) => [...toasts, { ...toast, id }]);
    if (durationMs !== null) {
      const countdown = { handle: undefined, remainingMs: durationMs, startedAt: 0, holds: 0 };
      this.start(id, countdown, durationMs);
    }
  }

  private start(id: number, countdown: Countdown, ms: number): void {
    countdown.remainingMs = ms;
    countdown.startedAt = Date.now();
    countdown.handle = setTimeout(() => this.dismiss(id), ms);
    this.countdowns.set(id, countdown);
  }
}
