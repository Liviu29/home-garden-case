import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Garden, Plant } from '../../core/api/models';
import { resolvePlantVisual } from '../../shared/utils/plant-visual-resolver';

interface MiniPlantView {
  readonly plantId: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly rotation: number;
  readonly symbolId: string;
  readonly paletteStyle: string;
}

/**
 * Static botanical snapshot of a garden for dashboard cards — the visual
 * bridge to the Garden Planner. Reuses the SAME
 * resolved artwork symbols and palettes the map draws, so a garden looks like
 * itself everywhere, but this is deliberately NOT a map: no layout algorithm
 * duplication, no camera, no interaction. Plants line up on a soil strip,
 * sized by the square root of their honest area share (so relative size still
 * means something without claiming to be the packed plan). Decorative only —
 * every number it hints at is printed as text next to it.
 */
@Component({
  selector: 'app-garden-mini-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg class="strip" viewBox="0 0 100 36" focusable="false" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="100" height="36" rx="5" class="soil" />
      <rect x="1.2" y="1.2" width="97.6" height="33.6" rx="4" class="fence" />
      @for (p of views(); track p.plantId) {
        <use
          [attr.href]="'#' + p.symbolId"
          [attr.x]="p.x - p.size / 2"
          [attr.y]="p.y - p.size / 2"
          [attr.width]="p.size"
          [attr.height]="p.size"
          [attr.transform]="'rotate(' + p.rotation + ' ' + p.x + ' ' + p.y + ')'"
          [style]="p.paletteStyle"
        />
      }
      @if (views().length === 0) {
        <g class="empty-rows">
          <line x1="12" y1="12" x2="88" y2="12" />
          <line x1="12" y1="19" x2="88" y2="19" />
          <line x1="12" y1="26" x2="88" y2="26" />
        </g>
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }

    .strip {
      display: block;
      width: 100%;
      height: auto;
    }

    .soil {
      fill: var(--map-lawn);
    }

    .fence {
      fill: none;
      stroke: var(--map-fence);
      stroke-width: 0.6;
      stroke-dasharray: 2 2.4;
      opacity: 0.6;
    }

    .empty-rows line {
      stroke: var(--map-free-border);
      stroke-width: 1.1;
      stroke-linecap: round;
      stroke-dasharray: 3 4;
      opacity: 0.55;
    }
  `,
})
export class GardenMiniPreview {
  readonly garden = input.required<Garden>();
  readonly plants = input.required<readonly Plant[]>();

  /** Largest plants first, capped so the strip never turns into confetti. */
  protected readonly views = computed<readonly MiniPlantView[]>(() => {
    const garden = this.garden();
    const total = Math.max(garden.totalSurfaceArea, 0.0001);
    const shown = [...this.plants()]
      .sort((a, b) => b.surfaceAreaRequired - a.surfaceAreaRequired || a.plantId - b.plantId)
      .slice(0, 6);
    const n = shown.length;
    return shown.map((plant, i) => {
      const visual = resolvePlantVisual(plant);
      const share = Math.min(1, plant.surfaceAreaRequired / total);
      // sqrt(share): relative visual size still tracks relative real area
      const size = 12 + Math.sqrt(share) * 26;
      const x = ((i + 0.5) / n) * 88 + 6;
      const y = 18 + ((visual.seed % 5) - 2) * 1.4; // deterministic jitter
      const { a, b, c } = visual.palette;
      return {
        plantId: plant.plantId,
        x,
        y,
        size,
        rotation: visual.rotation,
        symbolId: visual.symbolId,
        paletteStyle: `--pv-a:${a};--pv-b:${b};--pv-c:${c}`,
      };
    });
  });
}
