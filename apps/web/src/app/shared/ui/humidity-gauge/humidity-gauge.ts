import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Semi-circular humidity gauge with an animated value arc and a target marker
 * (DESIGN-SYSTEM §6). Value = average ideal humidity of the garden's plants;
 * marker = the garden's configured target.
 */
@Component({
  selector: 'app-humidity-gauge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="humidity-gauge">
      <svg viewBox="0 0 200 118" role="img" [attr.aria-label]="ariaLabel()">
        <!-- track -->
        <path
          [attr.d]="ARC"
          fill="none"
          stroke="var(--surface-2)"
          stroke-width="14"
          stroke-linecap="round"
        />
        <!-- value arc -->
        <path
          [attr.d]="ARC"
          fill="none"
          stroke="url(#humidity-gradient)"
          stroke-width="14"
          stroke-linecap="round"
          class="humidity-gauge__arc"
          [style.stroke-dasharray]="ARC_LENGTH"
          [style.stroke-dashoffset]="dashOffset()"
        />
        <defs>
          <linearGradient id="humidity-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#38bdf8" />
            <stop offset="100%" stop-color="var(--info-blue)" />
          </linearGradient>
        </defs>
        <!-- target marker -->
        <line
          [attr.x1]="marker().x1"
          [attr.y1]="marker().y1"
          [attr.x2]="marker().x2"
          [attr.y2]="marker().y2"
          stroke="var(--text-1)"
          stroke-width="3"
          stroke-linecap="round"
        />
        <text x="100" y="86" text-anchor="middle" class="humidity-gauge__value tabular">
          @if (hasValue()) {
            {{ rounded() }}%
          } @else {
            —
          }
        </text>
        <text x="100" y="106" text-anchor="middle" class="humidity-gauge__caption">
          {{ caption() }}
        </text>
      </svg>
      <figcaption class="humidity-gauge__target">
        <span class="humidity-gauge__dot" aria-hidden="true"></span>
        <ng-container i18n>target {{ target() }}%</ng-container>
      </figcaption>
    </figure>
  `,
  styles: `
    .humidity-gauge {
      margin: 0;
      display: grid;
      justify-items: center;
      gap: var(--sp-1);
    }

    svg {
      width: 100%;
      max-width: 13rem;
    }

    .humidity-gauge__arc {
      transition: stroke-dashoffset var(--dur-slow) var(--ease-out);
    }

    .humidity-gauge__value {
      font-family: var(--font-display);
      font-size: 1.75rem;
      font-weight: 700;
      fill: var(--text-1);
    }

    .humidity-gauge__caption {
      font-size: 0.75rem;
      fill: var(--text-3);
    }

    .humidity-gauge__target {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      font-size: var(--fs-caption);
      color: var(--text-2);
    }

    .humidity-gauge__dot {
      width: 0.625rem;
      height: 0.125rem;
      background: var(--text-1);
      border-radius: var(--radius-pill);
    }
  `,
})
export class HumidityGauge {
  /** Semi-circle from (16,100) to (184,100), r=84. */
  protected readonly ARC = 'M 16 100 A 84 84 0 0 1 184 100';
  protected readonly ARC_LENGTH = Math.PI * 84;

  /** Current value 0–100 (average plant humidity); null = no measurable data yet. */
  readonly value = input.required<number | null>();
  /** Garden's configured target 0–100. */
  readonly target = input.required<number>();

  protected readonly hasValue = computed(() => this.value() !== null);

  protected readonly caption = computed(() =>
    this.hasValue() ? $localize`avg humidity` : $localize`no plants yet`,
  );

  protected readonly rounded = computed(() => {
    const value = this.value();
    return value === null ? null : Math.round(value);
  });

  protected readonly dashOffset = computed(() => {
    const value = this.value();
    if (value === null) {
      return this.ARC_LENGTH; // empty arc — no data is not 0%
    }
    const clamped = Math.min(100, Math.max(0, value));
    return this.ARC_LENGTH * (1 - clamped / 100);
  });

  protected readonly marker = computed(() => {
    const clamped = Math.min(100, Math.max(0, this.target()));
    const angle = Math.PI * (1 - clamped / 100); // π → 0 across the arc
    const cx = 100;
    const cy = 100;
    const rInner = 70;
    const rOuter = 98;
    return {
      x1: cx + rInner * Math.cos(angle),
      y1: cy - rInner * Math.sin(angle),
      x2: cx + rOuter * Math.cos(angle),
      y2: cy - rOuter * Math.sin(angle),
    };
  });

  protected readonly ariaLabel = computed(() =>
    this.hasValue()
      ? $localize`Average humidity ${this.rounded()}:value: percent, target ${this.target()}:target: percent`
      : $localize`No measured humidity yet, target ${this.target()}:target: percent`,
  );
}
