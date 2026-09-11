import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type SkeletonVariant = 'line' | 'title' | 'circle' | 'rect';

/**
 * Ghost placeholder primitive (DESIGN-SYSTEM §4). Shape only: the gray base,
 * shimmer, radius, timing and reduced-motion behavior all come from the one
 * skeleton engine (styles/_skeleton.scss, `.skeleton-shimmer`). Always sized
 * to mirror the real element it stands in for, so content lands with zero
 * layout shift. Never announced — the owning container carries the status.
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The width lives on the host: a percentage then resolves against the
  // parent in every layout. On the inner span it collapsed to 0 in flex rows,
  // where the host shrink-wraps its content.
  host: { 'aria-hidden': 'true', '[style.width]': 'w()' },
  template: `<span
    class="skeleton-shimmer"
    [class]="variant()"
    [style.width]="w() ? '100%' : null"
    [style.height]="h()"
  ></span>`,
  styles: `
    :host {
      display: block;
      flex-shrink: 0; // a fixed-width ghost never squashes, as before
      max-width: 100%;
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
  `,
})
export class Skeleton {
  readonly variant = input<SkeletonVariant>('line');
  readonly w = input<string | null>(null);
  readonly h = input<string | null>(null);
}
