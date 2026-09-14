import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';

type CapacityLevel = 'ok' | 'warn' | 'full';

/**
 * Animated surface-area occupancy bar (DESIGN-SYSTEM §6).
 * Color communicates load (green → amber > 80% → red full) and the label
 * always carries the numbers — never color alone (a11y).
 */
@Component({
  selector: 'app-capacity-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, PercentPipe],
  template: `
    <div class="capacity-bar">
      @if (showLabel()) {
        <div class="capacity-bar__label">
          <span>{{ used() | number: '1.0-2' }} / {{ total() | number: '1.0-2' }} m²</span>
          <span class="capacity-bar__pct tabular">{{ ratio() | percent: '1.0-0' }}</span>
        </div>
      }
      <div
        class="capacity-bar__track"
        role="progressbar"
        [attr.aria-valuenow]="usedRounded()"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="total()"
        [attr.aria-label]="surfaceLabel()"
      >
        <div
          class="capacity-bar__fill"
          [class]="'capacity-bar__fill--' + level()"
          [style.transform]="'scaleX(' + clamped() + ')'"
        ></div>
      </div>
    </div>
  `,
  styles: `
    .capacity-bar {
      display: grid;
      gap: var(--sp-1);
    }

    .capacity-bar__label {
      display: flex;
      justify-content: space-between;
      font-size: var(--fs-caption);
      color: var(--text-2);
    }

    .capacity-bar__pct {
      font-weight: 600;
      color: var(--text-1);
    }

    .capacity-bar__track {
      height: 0.5rem;
      border-radius: var(--radius-pill);
      background: var(--surface-2);
      overflow: hidden;
    }

    .capacity-bar__fill {
      height: 100%;
      border-radius: inherit;
      transform-origin: left center;
      // Grows from 0 to the bound value on first paint, then follows changes.
      transition: transform var(--dur-slow) var(--ease-out);

      @starting-style {
        transform: scaleX(0) !important;
      }

      &.capacity-bar__fill--ok {
        background: var(--gradient-brand);
      }

      &.capacity-bar__fill--warn {
        background: linear-gradient(90deg, var(--accent-amber), #f59e0b);
      }

      &.capacity-bar__fill--full {
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

  /**
   * `used` is a SUM of plant areas, and binary floats do not add decimals
   * exactly (1.2 + 3 + 0.6 = 4.800000000000001). Everything shown or
   * announced goes through two decimals — the same precision as the forms.
   */
  protected readonly usedRounded = computed(() => Math.round(this.used() * 100) / 100);

  protected readonly surfaceLabel = computed(
    () =>
      $localize`Surface used: ${this.usedRounded()}:used: of ${this.total()}:total: square meters`,
  );

  protected readonly level = computed<CapacityLevel>(() => {
    const r = this.ratio();
    if (r >= 1) {
      return 'full';
    }
    return r > 0.8 ? 'warn' : 'ok';
  });
}
