import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastStore } from '../../../core/errors/toast-store';

/**
 * Renders the toast queue bottom-center (DESIGN-SYSTEM §6).
 * Mounted once in the app shell; announces politely to assistive tech.
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-host" aria-live="polite">
      @for (toast of store.toasts(); track toast.id) {
        <!-- Pointer or focus on a toast pauses its countdown (ToastStore.hold) -->
        <div
          class="toast anim-fade-up"
          [class]="'toast--' + toast.tone"
          (mouseenter)="store.hold(toast.id)"
          (mouseleave)="store.release(toast.id)"
          (focusin)="store.hold(toast.id)"
          (focusout)="store.release(toast.id)"
        >
          <span class="toast__glyph" aria-hidden="true">
            @switch (toast.tone) {
              @case ('success') {
                ✓
              }
              @case ('error') {
                !
              }
              @default {
                i
              }
            }
          </span>
          <span class="toast__message">{{ toast.message }}</span>
          @if (toast.actionLabel) {
            <button class="toast__action press-feedback" type="button" (click)="run(toast.id)">
              {{ toast.actionLabel }}
            </button>
          }
          <button
            class="toast__close"
            type="button"
            aria-label="Dismiss"
            i18n-aria-label
            (click)="store.dismiss(toast.id)"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-host {
      position: fixed;
      bottom: var(--sp-6);
      left: 50%;
      transform: translateX(-50%);
      display: grid;
      gap: var(--sp-2);
      z-index: var(--z-toast);
      width: min(92vw, 26rem);
    }

    .toast {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
      border-radius: var(--radius-pill);
      background: var(--surface-inverse);
      color: var(--text-on-inverse);
      box-shadow: var(--shadow-3);
      font-size: var(--fs-body);
    }

    .toast__glyph {
      flex: none;
      width: 1.375rem;
      height: 1.375rem;
      display: grid;
      place-items: center;
      border-radius: 50%;
      font-weight: 700;
      font-size: 0.75rem;
      background: var(--brand-500);
    }

    .toast--error .toast__glyph {
      background: var(--danger);
    }

    .toast--info .toast__glyph {
      background: var(--info-blue);
    }

    .toast__message {
      flex: 1;
    }

    .toast__action {
      flex: none;
      border: 0;
      // Tinted with the pill's own foreground, so the affordance survives the
      // inverted surface flipping from near-black (light) to near-white (dark).
      background: color-mix(in srgb, var(--text-on-inverse) 14%, transparent);
      color: inherit;
      font: inherit;
      font-weight: 600;
      padding: var(--sp-1) var(--sp-3);
      border-radius: var(--radius-pill);
      cursor: pointer;

      &:hover {
        background: color-mix(in srgb, var(--text-on-inverse) 24%, transparent);
      }
    }

    .toast__close {
      flex: none;
      border: 0;
      background: transparent;
      color: color-mix(in srgb, var(--text-on-inverse) 72%, transparent);
      font-size: 1.125rem;
      cursor: pointer;
      line-height: 1;
      padding: var(--sp-1);
    }
  `,
})
export class ToastHost {
  protected readonly store = inject(ToastStore);

  protected run(id: number): void {
    const toast = this.store.toasts().find((t) => t.id === id);
    toast?.action?.();
    this.store.dismiss(id);
  }
}
