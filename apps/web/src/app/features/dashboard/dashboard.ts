import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { Garden, Plant } from '../../core/api/models';
import { SessionStore } from '../../core/auth/session-store';
import { CapacityBar } from '../../shared/ui/capacity-bar/capacity-bar';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { SkeletonGroup } from '../../shared/ui/skeleton/skeleton-group';
import { StatCard } from '../../shared/ui/stat-card/stat-card';
import {
  averageHumidity,
  gardenAttention,
  humidityDelta,
  occupancyRatio,
  usedSurfaceArea,
} from '../../shared/utils/garden-insights';
import { GardensStore } from '../gardens/gardens-store';
import { PlantsIndexStore } from '../gardens/plants-index-store';

interface GardenInsight {
  readonly garden: Garden;
  readonly plants: readonly Plant[] | undefined;
  readonly delta: number | null;
  readonly occupancy: number;
  readonly needsAttention: boolean;
  readonly attentionReason: string;
}

/**
 * Overview: greeting hero, count-up stats, humidity-vs-target per garden and
 * an attention list (near-capacity or humidity drift, DESIGN-SYSTEM §6).
 * Reuses GardensStore + PlantsIndexStore — no duplicate fetching, all SWR.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DecimalPipe,
    MatButtonModule,
    StatCard,
    Skeleton,
    SkeletonGroup,
    EmptyState,
    CapacityBar,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  protected readonly session = inject(SessionStore);
  protected readonly gardens = inject(GardensStore);
  protected readonly plantsIndex = inject(PlantsIndexStore);

  constructor() {
    void this.gardens.load();
    effect(() => {
      const ids = this.gardens.gardens().map((g) => g.gardenId);
      if (ids.length > 0) {
        this.plantsIndex.loadFor(ids);
      }
    });
  }

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const name = this.session.profile()?.firstName;
    const salute = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return name ? `${salute}, ${name}` : salute;
  });

  protected readonly insights = computed<GardenInsight[]>(() =>
    this.gardens.gardens().map((garden) => {
      const plants = this.plantsIndex.byGarden()[garden.gardenId];
      const known = plants ?? [];
      const attention = gardenAttention(garden, known);
      const needsAttention =
        plants !== undefined && (attention.nearCapacity || attention.humidityDrift);
      return {
        garden,
        plants,
        delta: plants ? humidityDelta(garden, plants) : null,
        occupancy: occupancyRatio(garden, known),
        needsAttention,
        attentionReason: attention.nearCapacity
          ? 'Almost at capacity'
          : 'Humidity drifting from target',
      };
    }),
  );

  protected readonly attention = computed(() => this.insights().filter((i) => i.needsAttention));

  protected readonly totalPlants = computed(() =>
    Object.values(this.plantsIndex.byGarden()).reduce((sum, plants) => sum + plants.length, 0),
  );

  protected readonly totalArea = computed(() =>
    this.gardens.gardens().reduce((sum, g) => sum + g.totalSurfaceArea, 0),
  );

  protected readonly overallAvgHumidity = computed(() => {
    const allPlants = Object.values(this.plantsIndex.byGarden()).flat();
    return averageHumidity(allPlants);
  });

  protected usedOf(plants: readonly Plant[]): number {
    return usedSurfaceArea(plants);
  }
}
