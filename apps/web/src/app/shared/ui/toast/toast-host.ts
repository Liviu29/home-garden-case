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
    <div class="host" aria-live="polite">
      @for (toast of store.toasts(); track toast.id) {
        <!-- Pointer or focus on a toast pauses its countdown (ToastStore.hold) -->
        <div
          class="toast anim-fade-up"
          [class]="toast.tone"
          (mouseenter)="store.hold(toast.id)"
          (mouseleave)="store.release(toast.id)"
          (focusin)="store.hold(toast.id)"
          (focusout)="store.release(toast.id)"
        >
          <span class="glyph" aria-hidden="true">
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
          <span class="message">{{ toast.message }}</span>
          @if (toast.actionLabel) {
            <button class="action press-feedback" type="button" (click)="run(toast.id)">
              {{ toast.actionLabel }}
            </button>
          }
          <button
            class="close"
            type="button"
            aria-label="Dismiss"
            (click)="store.dismiss(toast.id)"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .host {
      position: fixed;
      bottom: var(--sp-6);
      left: 50%;
      transform: translateX(-50%);
      display: grid;
      gap: var(--sp-2);
      z-index: 1000;
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

    .glyph {
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

    .toast.error .glyph {
      background: var(--danger);
    }

    .toast.info .glyph {
      background: var(--info-blue);
    }

    .message {
      flex: 1;
    }

    .action {
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

    .close {
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
