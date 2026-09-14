import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import type { Garden, Plant } from '../../../../core/api/models';
import { PlantThumb } from '../../../../shared/ui/plant-visuals/plant-thumb';
import { PLANT_TYPE_LABEL } from '../../../../shared/ui/plant-visuals/plant-type-label';
import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { WATERING_ZONE_LABEL } from '../../../../shared/ui/watering-zone/watering-zone-labels';
import { plantHumidityDelta } from '../../../../domain/garden-insights/garden-insights';
import {
  type WateringConflict,
  wateringZone,
  zoneBreakdown,
} from '../../../../domain/garden-planner/garden-planner';

interface NeighbourNote {
  readonly plantId: number;
  readonly name: string;
  readonly humidity: number;
  readonly delta: number;
}

/**
 * The planner's inspector: plain DOM, the accessible home of every bed's
 * details (the SVG only mirrors them). With a bed selected it shows the
 * plant's facts, its watering zone, whether the gardener placed it, and any
 * neighbour it clashes with on watering; idle, it summarises the garden and
 * offers "Group by water needs". It owns no state — the map feeds it and
 * forwards its intents.
 */
@Component({
  selector: 'app-map-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatButtonModule, PlantThumb, Skeleton],
  templateUrl: './map-inspector.html',
  styleUrl: './map-inspector.scss',
})
export class MapInspector {
  readonly garden = input.required<Garden>();
  readonly plants = input.required<readonly Plant[]>();
  /** The selected plant, or null for the garden overview. */
  readonly plant = input<Plant | null>(null);
  readonly mutating = input(false);
  /** A DELETE (not a PUT) is in flight — the hidden status names the right operation. */
  readonly deleting = input(false);
  /** The selected bed sits where the gardener put it, not where auto-layout did. */
  readonly customPosition = input(false);
  readonly utilizationPct = input(0);
  readonly freeArea = input(0);
  readonly conflicts = input<readonly WateringConflict[]>([]);
  /** The last "Group by water needs" found no overlap-free arrangement. */
  readonly arrangeBlocked = input(false);

  readonly focusPlant = output<void>();
  readonly editPlant = output<Plant>();
  readonly removePlant = output<Plant>();
  readonly clear = output<void>();
  readonly returnHome = output<number>();
  readonly arrange = output<void>();
  readonly showZones = output<void>();

  /** Screen-reader status while the selected plant's PUT or DELETE is in flight. */
  protected readonly busyLabel = computed(() => {
    const plantName = this.plant()?.plantName ?? '';
    return this.deleting()
      ? $localize`Removing ${plantName}:plantName:`
      : $localize`Saving changes to ${plantName}:plantName:`;
  });

  protected readonly placeLabel = computed(() =>
    this.customPosition() ? $localize`Placed by you` : $localize`Auto-placed`,
  );

  protected readonly clashCount = computed(() => this.conflicts().length);
  protected readonly typeLabel = PLANT_TYPE_LABEL;
  protected readonly zoneLabel = WATERING_ZONE_LABEL;

  protected readonly share = computed(() => {
    const plant = this.plant();
    const total = this.garden().totalSurfaceArea;
    return plant && total > 0 ? (plant.surfaceAreaRequired / total) * 100 : 0;
  });
  /** Contribution bar fill, 0..1 (a transform scale, never a width). */
  protected readonly shareRatio = computed(() => Math.min(1, this.share() / 100));

  protected readonly humidityDelta = computed(() => {
    const plant = this.plant();
    return plant ? plantHumidityDelta(this.garden(), plant) : 0;
  });

  protected readonly zone = computed(() => {
    const plant = this.plant();
    if (!plant) {
      return null;
    }
    const zone = wateringZone(plant.idealHumidityLevel);
    return { zone, label: WATERING_ZONE_LABEL[zone] };
  });

  protected readonly zones = computed(() => zoneBreakdown(this.plants()));

  /** Neighbours of the selected bed that cannot share its watering pass. */
  protected readonly neighbours = computed<readonly NeighbourNote[]>(() => {
    const plant = this.plant();
    if (!plant) {
      return [];
    }
    const notes: NeighbourNote[] = [];
    for (const c of this.conflicts()) {
      if (c.a !== plant.plantId && c.b !== plant.plantId) {
        continue;
      }
      const other = this.plants().find((p) => p.plantId === (c.a === plant.plantId ? c.b : c.a));
      if (other) {
        notes.push({
          plantId: other.plantId,
          name: other.plantName,
          humidity: other.idealHumidityLevel,
          delta: c.delta,
        });
      }
    }
    return notes;
  });

  /** Regrouping needs at least two beds with a real footprint. */
  protected readonly canArrange = computed(
    () => this.plants().filter((p) => p.surfaceAreaRequired > 0).length >= 2,
  );
}
