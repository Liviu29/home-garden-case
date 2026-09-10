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
      @switch (headingLevel()) {
        @case (1) {
          <h1 class="title">{{ title() }}</h1>
        }
        @case (2) {
          <h2 class="title">{{ title() }}</h2>
        }
        @default {
          <h3 class="title">{{ title() }}</h3>
        }
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
  /**
   * Semantic level only — the visual size is fixed by `.title`, so callers
   * place the heading correctly in the document outline without changing how
   * it looks (F-08).
   *
   * - `1` — the empty state IS the page (404, an unloadable route).
   * - `2` — a page-level empty state sitting directly under the page `h1`.
   * - `3` — nested inside a section that already has its own `h2` (default).
   */
  readonly headingLevel = input<1 | 2 | 3>(3);
}
