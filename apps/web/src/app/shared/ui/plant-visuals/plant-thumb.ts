import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Plant } from '../../../core/api/models';
import { resolvePlantVisual } from './plant-visual-resolver';

/**
 * Small botanical thumbnail — the same resolved artwork the Garden Map draws,
 * so the table, inspector and map stay visually connected. References the
 * shared PlantArtworkDefs symbols (rendered once per page); decorative only,
 * therefore aria-hidden.
 */
@Component({
  selector: 'app-plant-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <span class="thumb" [style]="paletteStyle()">
      <svg viewBox="-50 -50 100 100" focusable="false">
        <use [attr.href]="'#' + visual().symbolId" x="-50" y="-50" width="100" height="100" />
      </svg>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .thumb {
      display: inline-grid;
      place-items: center;
      width: var(--thumb-size, 2rem);
      height: var(--thumb-size, 2rem);
      border-radius: 30%;
      background: radial-gradient(
        circle at 32% 28%,
        color-mix(in srgb, var(--map-bed) 80%, #fff) 0%,
        var(--map-bed) 75%
      );
      border: 1px solid color-mix(in srgb, var(--map-bed-border) 60%, transparent);
      overflow: hidden;
    }

    svg {
      width: 86%;
      height: 86%;
    }
  `,
})
export class PlantThumb {
  readonly plant = input.required<Pick<Plant, 'plantId' | 'plantName' | 'species' | 'plantType'>>();

  protected readonly visual = computed(() => resolvePlantVisual(this.plant()));
  protected readonly paletteStyle = computed(() => {
    const { a, b, c } = this.visual().palette;
    return `--pv-a:${a};--pv-b:${b};--pv-c:${c}`;
  });
}
