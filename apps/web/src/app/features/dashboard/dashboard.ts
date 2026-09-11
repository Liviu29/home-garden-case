import { computed, inject, ChangeDetectionStrategy, Component, Injector } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { Garden, Plant } from '../../core/api/models';
import { SessionStore } from '../../core/auth/session-store';
import { CapacityBar } from '../../shared/ui/capacity-bar/capacity-bar';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PlantArtworkDefs } from '../../shared/ui/plant-visuals/plant-artwork-defs';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { SkeletonGroup } from '../../shared/ui/skeleton/skeleton-group';
import { StatCard } from '../../shared/ui/stat-card/stat-card';
import {
  CAPACITY_STATUS_LABEL,
  CapacityStatus,
  averageHumidity,
  capacityStatus,
  gardenAttention,
  humidityDelta,
  occupancyRatio,
  usedSurfaceArea,
} from '../../domain/garden-insights/garden-insights';
import { GardensStore } from '../../state/gardens-store/gardens-store';
import { PlantsIndexStore } from '../../state/plants-index-store/plants-index-store';
import { GardenMiniPreview } from './garden-mini-preview/garden-mini-preview';
import { StatusBadge, StatusTone } from '../../shared/ui/status-badge/status-badge';
import { CAPACITY_STATUS_TONE } from '../../shared/ui/capacity-status/capacity-status';

type AttentionKind = 'capacity' | 'humidity';

interface GardenInsight {
  readonly garden: Garden;
  readonly plants: readonly Plant[] | undefined;
  readonly delta: number | null;
  readonly avgHumidity: number | null;
  readonly occupancy: number;
  readonly used: number;
  readonly status: CapacityStatus;
  readonly statusLabel: string;
  readonly statusTone: StatusTone;
  readonly needsAttention: boolean;
  readonly attentionKind: AttentionKind;
  readonly attentionReason: string;
  /** Lower sorts first in the Attention Center (UI presentation only). */
  readonly severity: number;
}

/**
 * Smart Garden Control Center: hero with derived portfolio status, four KPI
 * tiles, an Attention Center and a Garden Health grid whose cards carry a
 * mini botanical preview (the visual bridge to the Garden Planner).
 * Reuses GardensStore + PlantsIndexStore — no duplicate fetching, all SWR.
 * Every number is derived from existing data via computed(); nothing here is
 * stored, persisted or invented.
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
    GardenMiniPreview,
    PlantArtworkDefs,
    StatusBadge,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  protected readonly session = inject(SessionStore);
  protected readonly gardens = inject(GardensStore);
  protected readonly plantsIndex = inject(PlantsIndexStore);

  /** The source the plants index follows; the store owns the fan-out itself. */
  private readonly gardenIds = computed(() => this.gardens.gardens().map((g) => g.gardenId));

  constructor() {
    void this.gardens.load();
    // Declare the source once — see PlantsIndexStore.ensureForGardens.
    this.plantsIndex.ensureForGardens(this.gardenIds, { injector: inject(Injector) });
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
      const status = capacityStatus(garden, known);
      const delta = plants ? humidityDelta(garden, plants) : null;
      const occupancy = occupancyRatio(garden, known);
      const kind: AttentionKind = attention.nearCapacity ? 'capacity' : 'humidity';
      return {
        garden,
        plants,
        delta,
        avgHumidity: plants ? averageHumidity(plants) : null,
        occupancy,
        used: usedSurfaceArea(known),
        status,
        statusLabel:
          plants === undefined
            ? this.plantsIndex.failed()[garden.gardenId]
              ? 'Unavailable'
              : '' // still loading: the template shows a badge-sized ghost
            : known.length === 0
              ? 'No plants yet'
              : attention.humidityDrift && !attention.nearCapacity
                ? 'Humidity attention'
                : CAPACITY_STATUS_LABEL[status],
        statusTone:
          plants === undefined || known.length === 0
            ? ('neutral' as const)
            : attention.humidityDrift && !attention.nearCapacity
              ? ('warning' as const)
              : CAPACITY_STATUS_TONE[status],
        needsAttention,
        attentionKind: kind,
        // Reuse the semantic status vocabulary — a 100% garden says "Full",
        // not "almost".
        attentionReason: attention.nearCapacity
          ? CAPACITY_STATUS_LABEL[status]
          : 'Humidity drifting from target',
        // UI-only ordering (documented in DESIGN-SYSTEM §6): full → near-full
        // → humidity drift by distance. Not a business rule.
        severity:
          status === 'full'
            ? 0
            : attention.nearCapacity
              ? 1 - occupancy // closer to full sorts higher
              : 2 - Math.min(1, Math.abs(delta ?? 0) / 100),
      };
    }),
  );

  protected readonly attention = computed(() =>
    this.insights()
      .filter((i) => i.needsAttention)
      .sort((a, b) => a.severity - b.severity),
  );

  protected readonly healthyCount = computed(
    () => this.insights().filter((i) => i.plants !== undefined && !i.needsAttention).length,
  );

  protected readonly mostUrgent = computed<GardenInsight | null>(() => this.attention()[0] ?? null);

  protected readonly totalPlants = computed(() =>
    Object.values(this.plantsIndex.byGarden()).reduce((sum, plants) => sum + plants.length, 0),
  );

  protected readonly totalArea = computed(() =>
    this.gardens.gardens().reduce((sum, g) => sum + g.totalSurfaceArea, 0),
  );

  protected readonly usedArea = computed(() =>
    Object.values(this.plantsIndex.byGarden()).reduce(
      (sum, plants) => sum + usedSurfaceArea(plants),
      0,
    ),
  );

  protected readonly freeArea = computed(() => Math.max(0, this.totalArea() - this.usedArea()));

  protected readonly utilizationPct = computed(() => {
    const total = this.totalArea();
    return total > 0 ? Math.round((this.usedArea() / total) * 100) : 0;
  });

  /**
   * True once every garden's plant list has arrived — or definitively failed.
   * A failed garden must settle too, or its ghosts would wait forever.
   */
  protected readonly plantsSettled = computed(() =>
    this.gardens
      .gardens()
      .every(
        (g) =>
          this.plantsIndex.byGarden()[g.gardenId] !== undefined ||
          this.plantsIndex.failed()[g.gardenId] === true,
      ),
  );

  /** At least one garden's plants could not load (KPIs are then partial). */
  protected readonly plantsFailed = computed(() =>
    this.gardens.gardens().some((g) => this.plantsIndex.failed()[g.gardenId] === true),
  );

  protected plantsFailedFor(gardenId: number): boolean {
    return this.plantsIndex.failed()[gardenId] === true;
  }
}
