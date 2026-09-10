import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

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
      @if (context()) {
        <span class="context">{{ context() }}</span>
      }
      @if (progress() !== null) {
        <span
          class="strip"
          role="progressbar"
          [attr.aria-label]="label() + ' progress'"
          [attr.aria-valuenow]="progressPct()"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span
            class="strip-fill"
            [class.warn]="progressWarn()"
            [style.width.%]="progressPct()"
          ></span>
        </span>
      }
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

    .context {
      color: var(--text-3);
      font-size: var(--fs-caption);
      margin-top: var(--sp-1);
    }

    // Tiny progress strip — a quiet visual accent, not a chart
    .strip {
      display: block;
      height: 0.3rem;
      border-radius: var(--radius-pill);
      background: var(--surface-2);
      overflow: hidden;
      margin-top: var(--sp-2);
    }

    .strip-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--gradient-brand);
      transition: width var(--dur-slow) var(--ease-out);

      &.warn {
        background: var(--accent-amber);
      }
    }
  `,
})
export class StatCard {
  readonly value = input.required<number>();
  readonly label = input.required<string>();
  readonly suffix = input('');
  /** Small secondary context line (e.g. "2 healthy · 1 needs attention"). */
  readonly context = input('');
  /** 0..1 renders a quiet progress strip; null (default) renders none. */
  readonly progress = input<number | null>(null);
  readonly progressWarn = input(false);

  protected readonly progressPct = computed(() =>
    Math.round(Math.min(1, Math.max(0, this.progress() ?? 0)) * 100),
  );

  protected readonly displayed = signal(0);

  constructor() {
    effect((onCleanup) => {
      const target = this.value();
      // matchMedia can be absent (test envs, some embedded webviews) — treat
      // that as reduced motion and jump straight to the value.
      const reduced =
        typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
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
