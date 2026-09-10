import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Presentation tone of a status chip. DOMAIN code decides which tone a state
 * maps to (e.g. capacityStatus → tone); the badge only renders it — one chip
 * implementation for the whole app (cleanup pass §30).
 */
export type StatusTone = 'success' | 'neutral' | 'warning' | 'critical';

/**
 * Semantic status chip: text + color, never color alone (a11y). Content is
 * projected so domain wrappers and features own their own labels.
 */
@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [class]="tone()"><ng-content /></span>`,
  styles: `
    :host {
      display: inline-flex;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      font-size: var(--fs-caption);
      font-weight: 600;
      padding: 0.125rem var(--sp-2);
      border-radius: var(--radius-pill);
      white-space: nowrap;
    }

    .success {
      background: var(--brand-soft);
      color: var(--brand-700);
      border: 1px solid var(--brand-soft-border);
    }

    .neutral {
      background: var(--surface-2);
      color: var(--text-2);
      border: 1px solid var(--border-strong);
    }

    .warning {
      background: var(--amber-soft);
      color: var(--accent-amber);
      border: 1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent);
    }

    .critical {
      background: var(--danger-soft);
      color: var(--danger);
      border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
    }
  `,
})
export class StatusBadge {
  readonly tone = input.required<StatusTone>();
}
