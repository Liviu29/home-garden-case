import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';

/**
 * Ghost state for the Garden Map (ASYNC-UX.md). It is
 * built on the real map's own geometry (garden-map.scss): the same
 * `.map-shell` columns, gap and breakpoint; a stage whose inner area has the
 * plan's 1.6 aspect with the same min/max height; the toolbar and HUD pills
 * where the real ones float; and an inspector in its idle layout (hint + fact
 * tiles). So the real map lands in exactly the space its ghost held.
 * Shown while plants load AND as the `@defer` placeholder while the deferred
 * chunk arrives; the engine's delayed appearance means a chunk or plant list
 * that lands quickly never flashes it.
 */
@Component({
  selector: 'app-garden-map-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  host: {
    class: 'skeleton-appear',
    role: 'status',
    'aria-label': 'Loading garden map',
  },
  template: `
    <span class="visually-hidden">Loading garden map…</span>
    <div class="ghost-shell" aria-hidden="true">
      <div class="ghost-stage">
        <div class="ghost-frame">
          <div class="ghost-garden">
            <app-skeleton class="bed-a" variant="rect" h="100%" />
            <app-skeleton class="bed-b" variant="rect" h="100%" />
            <app-skeleton class="bed-c" variant="rect" h="100%" />
          </div>
        </div>
        <app-skeleton class="ghost-toolbar" variant="rect" h="2.5rem" />
        <app-skeleton class="ghost-hud" variant="rect" h="2.6rem" />
      </div>
      <div class="ghost-inspector">
        <app-skeleton class="ghost-hint" variant="line" w="80%" h="0.75rem" />
        <div class="ghost-facts">
          @for (i of [1, 2, 3]; track i) {
            <app-skeleton variant="rect" h="3.5625rem" />
          }
        </div>
        <!-- the watering-zones card and the "Group by water needs" button -->
        <app-skeleton class="ghost-zones" variant="rect" h="6.75rem" />
        <app-skeleton class="ghost-arrange" variant="rect" w="11rem" h="2.5rem" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    // = .map-shell
    .ghost-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) clamp(17rem, 26%, 21rem);
      gap: var(--sp-4);
      align-items: stretch;
    }

    @media (max-width: 900px) {
      .ghost-shell {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    // = .map-stage: bordered, rounded; a lighter neutral gray than the
    // skeleton blocks on it, so the ghost garden reads as a plan
    .ghost-stage {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: var(--radius-m);
      background: color-mix(in srgb, var(--skeleton-base) 45%, var(--surface-1));
    }

    // = .map-svg: 1.6 aspect, same min/max height; padded by the camera's
    // Fit bands so the ghost garden sits where the real one is framed
    .ghost-frame {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      width: 100%;
      aspect-ratio: 1.6;
      min-height: 19rem;
      max-height: min(34rem, 62dvh);
      padding: 3.75rem 1.5rem 4rem;
    }

    .ghost-garden {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: var(--sp-2);
      height: 100%;
      max-width: 100%;
      aspect-ratio: 1.6;
    }

    .bed-a {
      grid-row: span 2;
    }

    .ghost-toolbar,
    .ghost-hud {
      position: absolute;
    }

    // where the real toolbar floats; spans the stage when the stage is narrow
    .ghost-toolbar {
      top: var(--sp-3);
      right: var(--sp-3);
      width: min(25.5rem, 100% - 2 * var(--sp-3));
    }

    .ghost-hud {
      bottom: var(--sp-3);
      left: var(--sp-3);
      width: min(25rem, 100% - 2 * var(--sp-3));
    }

    // = .map-inspector in its idle state: hint + fact tiles
    .ghost-inspector {
      display: grid;
      gap: var(--sp-3);
      align-content: start;
      min-height: 13rem;
      padding: var(--sp-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-m);
      background: var(--surface-1);
      box-shadow: var(--shadow-1);
    }

    .ghost-hint {
      padding-block: calc((var(--fs-caption) * 1.5 - 0.75rem) / 2);
    }

    .ghost-facts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--sp-2);
    }
  `,
})
export class GardenMapSkeleton {}
