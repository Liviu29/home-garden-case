import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PercentPipe } from '@angular/common';

export type CapacityLevel = 'ok' | 'warn' | 'full';

/**
 * Animated surface-area occupancy bar (DESIGN-SYSTEM §6).
 * Color communicates load (green → amber > 80% → red full) and the label
 * always carries the numbers — never color alone (a11y).
 */
@Component({
  selector: 'app-capacity-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PercentPipe],
  template: `
    <div class="wrap">
      @if (showLabel()) {
        <div class="label">
          <span>{{ used() }} / {{ total() }} m²</span>
          <span class="pct tabular">{{ ratio() | percent: '1.0-0' }}</span>
        </div>
      }
      <div
        class="track"
        role="progressbar"
        [attr.aria-valuenow]="used()"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="total()"
        [attr.aria-label]="'Surface used: ' + used() + ' of ' + total() + ' square meters'"
      >
        <div class="fill" [class]="level()" [style.transform]="'scaleX(' + clamped() + ')'"></div>
      </div>
    </div>
  `,
  styles: `
    .wrap {
      display: grid;
      gap: var(--sp-1);
    }

    .label {
      display: flex;
      justify-content: space-between;
      font-size: var(--fs-caption);
      color: var(--text-2);
    }

    .pct {
      font-weight: 600;
      color: var(--text-1);
    }

    .track {
      height: 0.5rem;
      border-radius: var(--radius-pill);
      background: var(--surface-2);
      overflow: hidden;
    }

    .fill {
      height: 100%;
      border-radius: inherit;
      transform-origin: left center;
      // Grows from 0 to the bound value on first paint, then follows changes.
      transition: transform var(--dur-slow) var(--ease-out) 150ms;

      @starting-style {
        transform: scaleX(0) !important;
      }

      &.ok {
        background: var(--gradient-brand);
      }

      &.warn {
        background: linear-gradient(90deg, var(--accent-amber), #f59e0b);
      }

      &.full {
        background: linear-gradient(90deg, var(--danger), #ef4444);
      }
    }
  `,
})
export class CapacityBar {
  readonly used = input.required<number>();
  readonly total = input.required<number>();
  readonly showLabel = input(true);

  protected readonly ratio = computed(() => {
    const total = this.total();
    return total > 0 ? this.used() / total : 0;
  });

  protected readonly clamped = computed(() => Math.min(1, Math.max(0, this.ratio())));

  protected readonly level = computed<CapacityLevel>(() => {
    const r = this.ratio();
    if (r >= 1) {
      return 'full';
    }
    return r > 0.8 ? 'warn' : 'ok';
  });
}
