import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';

/**
 * Dashboard stat tile with a count-up number tween (DESIGN-SYSTEM §5/6).
 * rAF-driven, 600ms ease-out; respects prefers-reduced-motion by jumping
 * straight to the value.
 */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card lift-hover">
      <span class="icon" aria-hidden="true"><ng-content select="[icon]" /></span>
      <span class="value tabular">{{ displayed() }}{{ suffix() }}</span>
      <span class="label">{{ label() }}</span>
    </div>
  `,
  styles: `
    .card {
      display: grid;
      gap: var(--sp-1);
      padding: var(--sp-6);
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius-l);
      box-shadow: var(--shadow-1);
    }

    .icon {
      width: 2.25rem;
      height: 2.25rem;
      display: grid;
      place-items: center;
      border-radius: var(--radius-m);
      background: var(--brand-soft);
      color: var(--brand-600);
      margin-bottom: var(--sp-2);
    }

    .value {
      font-family: var(--font-display);
      font-size: var(--fs-display);
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    .label {
      color: var(--text-2);
      font-size: var(--fs-caption);
    }
  `,
})
export class StatCard {
  readonly value = input.required<number>();
  readonly label = input.required<string>();
  readonly suffix = input('');

  protected readonly displayed = signal(0);

  constructor() {
    effect((onCleanup) => {
      const target = this.value();
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || target === 0) {
        this.displayed.set(target);
        return;
      }

      const start = performance.now();
      const from = this.displayed();
      const duration = 600;
      let frame = 0;

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        this.displayed.set(Math.round(from + (target - from) * eased));
        if (t < 1) {
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
      onCleanup(() => cancelAnimationFrame(frame));
    });
  }
}
