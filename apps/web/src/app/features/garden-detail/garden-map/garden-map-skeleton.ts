import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';

/**
 * Ghost state for the Garden Map (LOADING-EXPERIENCE §composition): the map
 * frame, toolbar pill, HUD chips and a few ghost plots — same silhouette as
 * the real thing, built from the shared skeleton primitives (no second
 * shimmer implementation). Shown while plants load AND as the `@defer`
 * placeholder while the deferred chunk arrives.
 */
@Component({
  selector: 'app-garden-map-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  host: {
    role: 'status',
    'aria-label': 'Loading garden map',
  },
  template: `
    <span class="visually-hidden">Loading garden map…</span>
    <div class="ghost-shell" aria-hidden="true">
      <div class="ghost-stage">
        <div class="ghost-toolbar">
          <app-skeleton variant="rect" w="9rem" h="1.75rem" />
        </div>
        <div class="ghost-plots">
          <app-skeleton variant="rect" w="34%" h="52%" />
          <app-skeleton variant="rect" w="24%" h="38%" />
          <app-skeleton variant="rect" w="18%" h="30%" />
        </div>
        <div class="ghost-hud">
          <app-skeleton variant="rect" w="8.5rem" h="1.6rem" />
          <app-skeleton variant="rect" w="5.5rem" h="1.6rem" />
          <app-skeleton variant="rect" w="7rem" h="1.6rem" />
        </div>
      </div>
      <div class="ghost-inspector">
        <app-skeleton variant="title" w="70%" h="1.2rem" />
        <app-skeleton variant="line" w="90%" />
        <app-skeleton variant="line" w="80%" />
        <app-skeleton variant="line" w="85%" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .ghost-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 264px;
      gap: var(--sp-4);
    }

    @media (max-width: 900px) {
      .ghost-shell {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .ghost-stage {
      position: relative;
      min-height: 18rem;
      border-radius: var(--radius-m);
      border: 1px solid var(--border);
      background: var(--gradient-skeleton-base);
      overflow: hidden;
    }

    .ghost-toolbar {
      position: absolute;
      top: var(--sp-3);
      right: var(--sp-3);
    }

    .ghost-plots {
      position: absolute;
      inset: var(--sp-8) var(--sp-4) var(--sp-8) var(--sp-4);
      display: flex;
      align-items: flex-start;
      gap: var(--sp-3);
    }

    .ghost-hud {
      position: absolute;
      left: var(--sp-3);
      bottom: var(--sp-3);
      display: flex;
      gap: var(--sp-2);
    }

    .ghost-inspector {
      display: grid;
      gap: var(--sp-3);
      align-content: start;
      padding: var(--sp-4);
      border-radius: var(--radius-m);
      border: 1px solid var(--border);
    }
  `,
})
export class GardenMapSkeleton {}
