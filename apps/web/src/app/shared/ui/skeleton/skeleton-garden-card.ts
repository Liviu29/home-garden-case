import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Skeleton } from './skeleton';

/**
 * Ghost composition for a garden card — the one ghost layout used
 * from more than one place. Row for row the real card (garden-list.html):
 * name + humidity chip, the capacity label + track, the status chip + counts —
 * with the real card's padding, gaps and line boxes, so a card lands in the
 * exact footprint its ghost held. Shape only: shimmer, timing and a11y come
 * from the shared engine (styles/_skeleton.scss).
 */
@Component({
  selector: 'app-skeleton-garden-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  template: `
    <div class="ghost-card">
      <div class="ghost-top">
        <app-skeleton variant="line" w="55%" h="1rem" />
        <app-skeleton variant="line" w="3.75rem" h="1.4rem" />
      </div>
      <div class="ghost-capacity">
        <div class="ghost-caption ghost-split">
          <app-skeleton variant="line" w="40%" h="0.7rem" />
          <app-skeleton variant="line" w="2.25rem" h="0.7rem" />
        </div>
        <app-skeleton variant="rect" h="0.5rem" />
      </div>
      <div class="ghost-meta">
        <app-skeleton variant="line" w="7rem" h="1.6rem" />
        <app-skeleton class="ghost-caption" variant="line" w="7.5rem" h="0.7rem" />
      </div>
    </div>
  `,
  styles: `
    // A grid host: the card fills the row height its grid neighbours set, so
    // a pending-create ghost beside taller real cards is never a stunted one.
    :host {
      display: grid;
    }

    .ghost-card {
      display: grid;
      gap: var(--sp-3);
      padding: var(--sp-6);
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius-l);
      box-shadow: var(--shadow-1);
    }

    // .card-top: the name's line box, clear of the kebab like the real row
    .ghost-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--sp-2);
      min-height: 1.625rem;
      padding-right: var(--sp-6);
    }

    // app-capacity-bar: caption row + track, 0.25rem apart
    .ghost-capacity {
      display: grid;
      gap: var(--sp-1);
    }

    .ghost-split {
      justify-content: space-between;
    }

    // one caption line box (13px × 1.5)
    .ghost-caption {
      display: flex;
      align-items: center;
      min-height: calc(var(--fs-caption) * 1.5);
    }

    // .meta: status chip + counts; wraps exactly where the real row wraps
    .ghost-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sp-2);
    }
  `,
})
export class SkeletonGardenCard {}
