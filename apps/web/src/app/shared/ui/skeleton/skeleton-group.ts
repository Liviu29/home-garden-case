import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Cold-load wrapper (ASYNC-UX.md, DESIGN-SYSTEM §4). While `loading`, it
 * renders the projected `[ghost]` layout in place of the content:
 *
 * - The ghost is in the layout from the first frame but only becomes visible
 *   after `--skeleton-delay` (`.skeleton-appear`, pure CSS). A fast response
 *   never flashes a skeleton, a slow one fades it in, and nothing shifts when
 *   it appears — the space was already reserved.
 * - Real content is never held back to "show off" the skeleton: when data
 *   lands, it renders. (The old timer pair kept a ghost up for a 300ms
 *   minimum and rendered the real — still empty — branch during the delay,
 *   which flashed "Everything looks healthy" before the dashboard loaded.)
 * - The host is `aria-busy`; a persistent polite live region announces the
 *   load (live regions inserted together with their text are often missed);
 *   the ghost itself is hidden from assistive tech.
 *
 * Usage:
 * ```html
 * <app-skeleton-group [loading]="store.isLoading()" label="Loading gardens">
 *   <div ghost>…content-shaped skeletons…</div>
 *   …real content…
 * </app-skeleton-group>
 * ```
 */
@Component({
  selector: 'app-skeleton-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-busy]': 'loading() || null' },
  template: `
    <span class="visually-hidden" role="status">{{ loading() ? label() : '' }}</span>
    @if (loading()) {
      <div class="ghost-slot skeleton-appear" aria-hidden="true">
        <ng-content select="[ghost]" />
      </div>
    } @else {
      <ng-content />
    }
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class SkeletonGroup {
  readonly loading = input.required<boolean>();
  /** What is loading — the screen-reader announcement. */
  readonly label = input('Loading…');
}
