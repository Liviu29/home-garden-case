import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SkeletonVariant = 'line' | 'title' | 'circle' | 'rect' | 'card';

/**
 * Ghost placeholder primitive (DESIGN-SYSTEM §4): gray block with a shared
 * gradient shimmer. Always sized to mirror the real element it stands in for,
 * so content lands with zero layout shift.
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-hidden]': 'true',
  },
  template: `<span
    class="ghost skeleton-shimmer"
    [class]="variant()"
    [style.width]="width()"
    [style.height]="height()"
  ></span>`,
  styles: `
    :host {
      display: block;
    }

    .ghost {
      display: block;
      position: relative;
      overflow: hidden;
      background: var(--gradient-skeleton-base);
      border-radius: var(--radius-s);

      // Shared shimmer sweep — one timeline, no per-block phase drift
      &::after {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--gradient-shimmer);
        animation: shimmer-sweep 1.4s ease-in-out infinite;
      }
    }

    .line {
      height: 0.875rem;
      width: 100%;
    }

    .title {
      height: 1.25rem;
      width: 60%;
    }

    .circle {
      border-radius: 50%;
      width: 2.5rem;
      height: 2.5rem;
    }

    .rect {
      height: 6rem;
      width: 100%;
    }

    .card {
      height: 11rem;
      width: 100%;
      border-radius: var(--radius-l);
    }
  `,
})
export class Skeleton {
  readonly variant = input<SkeletonVariant>('line');
  readonly w = input<string | null>(null);
  readonly h = input<string | null>(null);

  protected readonly width = computed(() => this.w());
  protected readonly height = computed(() => this.h());
}
