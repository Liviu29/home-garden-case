import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Garden, Plant } from '../../core/api/models';
import { CapacityBar } from '../../shared/ui/capacity-bar/capacity-bar';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { HumidityGauge } from '../../shared/ui/humidity-gauge/humidity-gauge';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { SkeletonGroup } from '../../shared/ui/skeleton/skeleton-group';
import { GardenFormDialog } from '../gardens/garden-form-dialog';
import { GardenDetailStore } from './garden-detail-store';
import { OccupancyVisualizer } from './occupancy-visualizer';
import { PlantFormDialog } from './plant-form-dialog';

/**
 * One garden in full: header with humidity gauge, proportional occupancy
 * visualizer, and the plants table with per-plant humidity delta.
 * Route param binds via withComponentInputBinding.
 */
@Component({
  selector: 'app-garden-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GardenDetailStore],
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatMenuModule,
    Skeleton,
    SkeletonGroup,
    EmptyState,
    CapacityBar,
    HumidityGauge,
    OccupancyVisualizer,
  ],
  templateUrl: './garden-detail.html',
  styleUrl: './garden-detail.scss',
})
export class GardenDetail {
  protected readonly store = inject(GardenDetailStore);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);

  /** From the route: /gardens/:gardenId */
  readonly gardenId = input.required({ transform: numberAttribute });

  constructor() {
    effect(() => {
      const id = this.gardenId();
      if (Number.isFinite(id)) {
        this.store.load(id);
      }
    });
  }

  protected openEditGarden(garden: Garden): void {
    this.dialog.open(GardenFormDialog, { data: { garden } });
  }

  protected openPlantForm(plant: Plant | null): void {
    const garden = this.store.garden();
    if (!garden) {
      return;
    }
    this.dialog.open(PlantFormDialog, {
      data: { garden, plants: this.store.plants(), plant, store: this.store },
    });
  }

  protected async removePlant(plant: Plant): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: 'Remove plant?',
      message: `“${plant.plantName}” will be removed from this garden.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      void this.store.removePlant(plant);
    }
  }

  protected humidityDeltaOf(plant: Plant, garden: Garden): number {
    return plant.idealHumidityLevel - garden.targetHumidityLevel;
  }

  protected typeGlyph(type: Plant['plantType']): string {
    switch (type) {
      case 'vegetable':
        return '🥬';
      case 'fruit':
        return '🍓';
      case 'flower':
        return '🌸';
    }
  }
}
