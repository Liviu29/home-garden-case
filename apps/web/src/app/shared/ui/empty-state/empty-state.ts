import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Designed empty state (CODING-GUIDELINES §7: empty result is not an error).
 * Sprout illustration in grays with a single green accent, one line of copy,
 * and a projected CTA.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty anim-fade-up">
      <svg class="art" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" fill="var(--surface-2)" />
        <path
          d="M60 88 V56"
          stroke="var(--border-strong)"
          stroke-width="4"
          stroke-linecap="round"
        />
        <path
          d="M60 62 C60 48 48 44 38 46 C40 58 50 64 60 62 Z"
          fill="var(--brand-400)"
          opacity="0.9"
        />
        <path d="M60 54 C60 42 70 36 80 38 C78 50 70 56 60 54 Z" fill="var(--brand-600)" />
        <ellipse cx="60" cy="92" rx="22" ry="5" fill="var(--surface-3)" />
      </svg>
      @if (headingLevel() === 1) {
        <h1 class="title">{{ title() }}</h1>
      } @else {
        <h3 class="title">{{ title() }}</h3>
      }
      <p class="message">{{ message() }}</p>
      <div class="action">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--sp-12) var(--sp-6);
      gap: var(--sp-2);
    }

    .art {
      width: 7.5rem;
      height: 7.5rem;
      margin-bottom: var(--sp-2);
    }

    .title {
      font-size: var(--fs-h3);
    }

    .message {
      color: var(--text-2);
      max-width: 26rem;
    }

    .action {
      margin-top: var(--sp-4);
    }
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly message = input<string>('');
  /** 1 on standalone pages (the 404 page must own an h1 — REM-013), 3 inside sections. */
  readonly headingLevel = input<1 | 3>(3);
}
