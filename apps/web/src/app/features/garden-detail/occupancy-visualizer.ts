import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Garden, Plant } from '../../core/api/models';
import { freeSurfaceArea } from '../../shared/utils/garden-insights';

interface Block {
  readonly key: string;
  readonly label: string;
  readonly sublabel: string;
  readonly type: Plant['plantType'] | 'free';
  /** flex-grow weight = m² */
  readonly weight: number;
  readonly share: number;
}

/**
 * Proportional occupancy visualizer (DESIGN-SYSTEM §6): one block per plant,
 * sized by surfaceAreaRequired, colored by plant type; remaining capacity
 * renders as a dashed "available" block. A treemap-lite the eye can audit
 * against the numbers.
 */
@Component({
  selector: 'app-occupancy-visualizer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="viz" role="img" [attr.aria-label]="ariaLabel()">
      @for (block of blocks(); track block.key) {
        <div
          class="block"
          [class]="block.type"
          [style.flex-grow]="block.weight"
          [title]="block.label + ' — ' + block.sublabel"
        >
          @if (block.share >= 0.12) {
            <span class="block-label">{{ block.label }}</span>
            <span class="block-sub">{{ block.sublabel }}</span>
          }
        </div>
      }
    </div>
    <div class="legend">
      <span class="legend-item"><i class="swatch vegetable"></i>Vegetable</span>
      <span class="legend-item"><i class="swatch fruit"></i>Fruit</span>
      <span class="legend-item"><i class="swatch flower"></i>Flower</span>
      <span class="legend-item"><i class="swatch free"></i>Available</span>
    </div>
  `,
  styles: `
    .viz {
      display: flex;
      gap: 0.375rem;
      min-height: 5.5rem;
      border-radius: var(--radius-m);
    }

    .block {
      position: relative;
      display: grid;
      align-content: end;
      gap: 0.125rem;
      padding: var(--sp-2) var(--sp-3);
      border-radius: var(--radius-s);
      min-width: 0.75rem;
      overflow: hidden;
      flex-basis: 0;
      animation: fade-up-in var(--dur-base) var(--ease-out) both;

      &.vegetable {
        background: linear-gradient(
          160deg,
          var(--hue-vegetable-soft),
          color-mix(in srgb, var(--hue-vegetable) 28%, white)
        );
        border: 1px solid color-mix(in srgb, var(--hue-vegetable) 35%, transparent);
      }

      &.fruit {
        background: linear-gradient(
          160deg,
          var(--hue-fruit-soft),
          color-mix(in srgb, var(--hue-fruit) 22%, white)
        );
        border: 1px solid color-mix(in srgb, var(--hue-fruit) 30%, transparent);
      }

      &.flower {
        background: linear-gradient(
          160deg,
          var(--hue-flower-soft),
          color-mix(in srgb, var(--hue-flower) 22%, white)
        );
        border: 1px solid color-mix(in srgb, var(--hue-flower) 30%, transparent);
      }

      &.free {
        border: 1.5px dashed var(--border-strong);
        background: repeating-linear-gradient(-45deg, transparent 0 8px, var(--surface-2) 8px 16px);
      }
    }

    .block-label {
      font-size: var(--fs-caption);
      font-weight: 650;
      color: var(--text-1);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .block-sub {
      font-size: 0.6875rem;
      color: var(--text-2);
      white-space: nowrap;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-4);
      margin-top: var(--sp-3);
      font-size: var(--fs-caption);
      color: var(--text-2);
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
    }

    .swatch {
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 0.25rem;

      &.vegetable {
        background: var(--hue-vegetable);
      }

      &.fruit {
        background: var(--hue-fruit);
      }

      &.flower {
        background: var(--hue-flower);
      }

      &.free {
        border: 1.5px dashed var(--border-strong);
      }
    }
  `,
})
export class OccupancyVisualizer {
  readonly garden = input.required<Garden>();
  readonly plants = input.required<readonly Plant[]>();

  protected readonly blocks = computed<Block[]>(() => {
    const garden = this.garden();
    const plants = this.plants();
    const total = Math.max(garden.totalSurfaceArea, 0.0001);

    const plantBlocks: Block[] = [...plants]
      .sort((a, b) => b.surfaceAreaRequired - a.surfaceAreaRequired)
      .map((plant) => ({
        key: `plant-${plant.plantId}`,
        label: plant.plantName,
        sublabel: `${plant.surfaceAreaRequired} m²`,
        type: plant.plantType,
        weight: plant.surfaceAreaRequired,
        share: plant.surfaceAreaRequired / total,
      }));

    const free = freeSurfaceArea(garden, plants);
    if (free > 0) {
      plantBlocks.push({
        key: 'free',
        label: 'Available',
        sublabel: `${round1(free)} m²`,
        type: 'free',
        weight: free,
        share: free / total,
      });
    }
    return plantBlocks;
  });

  protected readonly ariaLabel = computed(() => {
    const garden = this.garden();
    const free = freeSurfaceArea(garden, this.plants());
    return `Surface occupancy of ${garden.gardenName}: ${this.plants().length} plants, ${round1(free)} of ${garden.totalSurfaceArea} square meters available`;
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
