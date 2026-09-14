import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  Injector,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  numberAttribute,
  signal,
} from '@angular/core';
import { type OutdoorConditions, OutdoorWeather } from '../../core/weather/weather';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import type { Garden, Plant } from '../../core/api/models';
import { plantHumidityDelta } from '../../domain/garden-insights/garden-insights';
import { type WateringZone, wateringZone } from '../../domain/garden-planner/garden-planner';
import { CapacityBar } from '../../shared/ui/capacity-bar/capacity-bar';
import { CapacityStatusChip } from '../../shared/ui/capacity-status/capacity-status';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { HumidityGauge } from '../../shared/ui/humidity-gauge/humidity-gauge';
import { PlantArtworkDefs } from '../../shared/ui/plant-visuals/plant-artwork-defs';
import { PlantThumb } from '../../shared/ui/plant-visuals/plant-thumb';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { SkeletonGroup } from '../../shared/ui/skeleton/skeleton-group';
import { GardenFormDialog } from '../gardens/garden-form-dialog/garden-form-dialog';
import { GardensStore } from '../../state/gardens-store/gardens-store';
import { GardenDetailStore, isValidGardenId } from './garden-detail-store/garden-detail-store';
import {
  GardenLayoutRepository,
  type LayoutPositions,
} from '../../state/garden-layout/garden-layout-repository';
import { GardenMap } from './garden-map/garden-map';
import { GardenMapSkeleton } from './garden-map/garden-map-skeleton/garden-map-skeleton';
import { PlantFormDialog } from './plant-form-dialog/plant-form-dialog';
import { ThemeStore } from '../../core/config/theme-store';
import { Chart } from '../../shared/ui/chart/chart';
import { readChartPalette } from '../../shared/ui/chart/chart-palette';
import { HighchartsLoader } from '../../shared/ui/chart/highcharts-loader';
import { humidityProfileOptions } from './humidity-profile/humidity-profile-options';
import { ExportPngButton } from '../../shared/ui/export/export-png-button';

type PlantSortKey = 'name' | 'planted' | 'area' | 'humidity';
type SortDir = 'asc' | 'desc';

interface PlantSort {
  readonly key: PlantSortKey;
  readonly dir: SortDir;
}

const SORT_VALUE: Readonly<Record<PlantSortKey, (p: Plant) => string | number>> = {
  name: (p) => p.plantName.toLocaleLowerCase(),
  planted: (p) => Date.parse(p.plantationDate) || 0,
  area: (p) => p.surfaceAreaRequired,
  humidity: (p) => p.idealHumidityLevel,
};

const DAY_MS = 86_400_000;

/** A row's watering zone: as its tooltip, and as screen readers hear it after the humidity. */
const ZONE_TITLE: Readonly<Record<WateringZone, string>> = {
  dry: $localize`Dry watering zone`,
  balanced: $localize`Balanced watering zone`,
  humid: $localize`Humid watering zone`,
};
const ZONE_SPOKEN: Readonly<Record<WateringZone, string>> = {
  dry: $localize`dry watering zone`,
  balanced: $localize`balanced watering zone`,
  humid: $localize`humid watering zone`,
};

/**
 * One garden in full: header with humidity gauge, the interactive Garden Map
 * (a deferred digital twin — ADR-007), and the plants table with per-plant
 * humidity delta. Route param binds via withComponentInputBinding.
 */
@Component({
  selector: 'app-garden-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GardenDetailStore],
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    MatButtonModule,
    MatMenuModule,
    Skeleton,
    SkeletonGroup,
    EmptyState,
    CapacityBar,
    CapacityStatusChip,
    HumidityGauge,
    GardenMap,
    GardenMapSkeleton,
    PlantArtworkDefs,
    PlantThumb,
    Chart,
    ExportPngButton,
  ],
  templateUrl: './garden-detail.html',
  styleUrl: './garden-detail.scss',
})
export class GardenDetail {
  /** The route's garden id (withComponentInputBinding); everything per-garden follows it. */
  readonly gardenId = input.required({ transform: numberAttribute });

  protected readonly store = inject(GardenDetailStore);
  private readonly injector = inject(Injector);
  /** Header renders as a ghost while a garden PUT is in flight (ASYNC-UX). */
  protected readonly gardensStore = inject(GardensStore);

  /** Shared map↔table selection — Garden Detail UI state, never global. */
  protected readonly selectedPlantId = signal<number | null>(null);

  private readonly theme = inject(ThemeStore);

  /**
   * The humidity profile (ADR-008): one column per plant, rebuilt when the
   * plants, the selection or the theme change. Null while there is nothing to draw.
   */
  protected readonly humidityProfile = computed(() => {
    const garden = this.store.garden();
    const plants = this.store.plants();
    if (!garden || this.store.plantsStatus() !== 'ready' || plants.length === 0) {
      return null;
    }
    this.theme.theme();
    return humidityProfileOptions(
      garden,
      plants,
      this.selectedPlantId(),
      readChartPalette(),
      (id) => this.findOnPlan(id),
    );
  });

  // ── Planner UI state: local to this screen.
  // Positions are browser-local VISUAL preferences (GardenLayoutRepository);
  // history is a bounded stack; none of it ever touches business stores.
  private readonly layoutRepo = inject(GardenLayoutRepository);
  // Linked to the route: a new garden brings its own saved layout and a
  // fresh undo history, with no effect to keep them in step.
  protected readonly positions = linkedSignal<number, LayoutPositions>({
    source: this.gardenId,
    computation: (id) => (isValidGardenId(id) ? this.layoutRepo.load(id) : {}),
  });
  private readonly layoutPast = linkedSignal<number, readonly LayoutPositions[]>({
    source: this.gardenId,
    computation: () => [],
  });
  private readonly layoutFuture = linkedSignal<number, readonly LayoutPositions[]>({
    source: this.gardenId,
    computation: () => [],
  });
  protected readonly canUndo = computed(() => this.layoutPast().length > 0);
  protected readonly canRedo = computed(() => this.layoutFuture().length > 0);
  protected readonly hasCustomLayout = computed(() => Object.keys(this.positions()).length > 0);
  protected readonly plannerFullscreen = signal(false);
  protected readonly plannerQuery = signal('');

  /** Typed bridge for the native input event — keeps `$any` out of templates. */
  protected onPlannerQueryInput(event: Event): void {
    this.plannerQuery.set((event.target as HTMLInputElement).value);
  }
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly title = inject(Title);
  private readonly weather = inject(OutdoorWeather);

  /** Named beside the outdoor reading, as its source. */
  protected readonly weatherSource = this.weather.source;

  /**
   * Outdoor humidity where the garden is, when it has coordinates. Idle
   * otherwise: a garden without a location makes no request at all.
   * (A plain signal rather than `resource()`, which would add its runtime to
   * the initial bundle for this one line.)
   */
  protected readonly outdoor = signal<{
    readonly status: 'idle' | 'loading' | 'ready' | 'error';
    readonly reading: OutdoorConditions | null;
  }>({ status: 'idle', reading: null });
  private outdoorPlace = '';

  private loadOutdoor(latitude: number | null, longitude: number | null): void {
    if (latitude === null || longitude === null) {
      this.outdoorPlace = '';
      this.outdoor.set({ status: 'idle', reading: null });
      return;
    }
    const place = `${latitude},${longitude}`;
    if (place === this.outdoorPlace) {
      return; // the same place, revalidated: the reading on screen stands
    }
    this.outdoorPlace = place;
    this.outdoor.set({ status: 'loading', reading: null });
    this.weather.forPlace(latitude, longitude).then(
      (reading) => {
        if (this.outdoorPlace === place) {
          this.outdoor.set({ status: 'ready', reading });
        }
      },
      () => {
        if (this.outdoorPlace === place) {
          this.outdoor.set({ status: 'error', reading: null });
        }
      },
    );
  }

  /** From the route: /gardens/:gardenId */
  /** Retry after a transient read failure (5xx/network — not a 404). */
  protected retryGarden(): void {
    const id = this.gardenId();
    if (isValidGardenId(id)) {
      this.store.load(id);
    }
  }

  constructor() {
    // The outdoor reading follows the garden's coordinates.
    effect(() => {
      const garden = this.store.garden();
      this.loadOutdoor(garden?.latitude ?? null, garden?.longitude ?? null);
    });

    // The store follows the route's garden id: load it, or the not-found
    // state for a malformed deep link (/gardens/abc, /gardens/-1).
    this.store.loadFor(this.gardenId);
    // An undone removal brings a plant back under a new id: its bed returns
    // to the spot it had (the store has already saved it for later visits).
    effect(() => {
      const restored = this.store.restored();
      if (restored && restored.gardenId === this.gardenId()) {
        this.positions.update((positions) => ({ ...positions, ...restored.positions }));
      }
    });
    // Route title refines from 'Garden · HomeGarden' to the actual name.
    effect(() => {
      const garden = this.store.garden();
      if (garden) {
        this.title.setTitle(`${garden.gardenName} · HomeGarden`);
      }
    });
    // The humidity profile sits below the plan: have its library ready by the time it scrolls in.
    const charts = inject(HighchartsLoader);
    afterNextRender(() => charts.prefetchWhenIdle());
  }

  protected openEditGarden(garden: Garden): void {
    const ref = this.dialog.open(GardenFormDialog, { data: { garden } });
    // The gardens store wrote the update through the cache — reload picks it
    // up instantly (fresh hit, no request) and un-ghosts the header.
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.store.load(garden.gardenId);
      }
    });
  }

  protected openPlantForm(plant: Plant | null): void {
    const garden = this.store.garden();
    if (!garden) {
      return;
    }
    const ref = this.dialog.open(PlantFormDialog, {
      // Wide one-screen picker+form — designed to fit 1440×900 without
      // internal scrolling (Playwright-asserted).
      width: 'min(56rem, 96vw)',
      maxWidth: '96vw',
      data: { garden, plants: this.store.plants(), plant },
      // The dialog takes this screen's store from DI (it is provided here).
      injector: this.injector,
    });
    // A freshly planted bed becomes the selection, so the map centers
    // it and the inspector invites the user to drag it into place.
    ref.afterClosed().subscribe((saved) => {
      const createdId = this.store.lastCreatedPlantId();
      if (saved && !plant && createdId !== null) {
        this.selectedPlantId.set(createdId);
      }
    });
  }

  protected async removePlant(plant: Plant): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: $localize`Remove plant?`,
      message: $localize`“${plant.plantName}:plantName:” will be removed from this garden.`,
      confirmLabel: $localize`Remove`,
      destructive: true,
    });
    if (confirmed) {
      void this.store.removePlant(plant);
    }
  }

  protected humidityDeltaOf(plant: Plant, garden: Garden): number {
    return plantHumidityDelta(garden, plant);
  }

  protected zoneOf(plant: Plant): WateringZone {
    return wateringZone(plant.idealHumidityLevel);
  }

  protected zoneTitle(plant: Plant): string {
    return ZONE_TITLE[this.zoneOf(plant)];
  }

  protected zoneSpoken(plant: Plant): string {
    return ZONE_SPOKEN[this.zoneOf(plant)];
  }

  protected showOnPlanLabel(plant: Plant): string {
    return $localize`Show ${plant.plantName}:plantName: on the garden plan`;
  }

  /** Titles of the PNG exports. */
  protected planTitle(gardenName: string): string {
    return $localize`${gardenName}:gardenName: garden plan`;
  }

  protected profileTitle(gardenName: string): string {
    return $localize`${gardenName}:gardenName: humidity profile`;
  }

  // ── Plants table sorting: presentation only — the store order is untouched ─
  protected readonly sortColumns: readonly {
    readonly key: PlantSortKey;
    readonly label: string;
    readonly num: boolean;
  }[] = [
    { key: 'name', label: $localize`Plant`, num: false },
    { key: 'planted', label: $localize`Planted`, num: false },
    { key: 'area', label: $localize`Area`, num: true },
    { key: 'humidity', label: $localize`Humidity`, num: true },
  ];
  protected readonly plantSort = signal<PlantSort | null>(null);

  protected readonly sortedPlants = computed(() => {
    const plants = this.store.plants();
    const sort = this.plantSort();
    if (!sort) {
      return plants;
    }
    const value = SORT_VALUE[sort.key];
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...plants].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : a.plantId - b.plantId) * dir;
    });
  });

  /** Each header cycles: its natural direction → reversed → the original order. */
  protected sortBy(key: PlantSortKey): void {
    const current = this.plantSort();
    const natural: SortDir = key === 'name' ? 'asc' : 'desc';
    if (current?.key !== key) {
      this.plantSort.set({ key, dir: natural });
    } else if (current.dir === natural) {
      this.plantSort.set({ key, dir: natural === 'asc' ? 'desc' : 'asc' });
    } else {
      this.plantSort.set(null);
    }
  }

  protected ariaSort(key: PlantSortKey): 'ascending' | 'descending' | null {
    const sort = this.plantSort();
    return sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : null;
  }

  /**
   * "3 days ago" — how long a plant has been in the ground, in calendar days.
   * A plantation date is stored as UTC midnight of the chosen day, so its day
   * is read in UTC; "today" is the viewer's LOCAL calendar day. (Reading both
   * in UTC labelled a plant set today "Tomorrow" east of Greenwich, from local
   * midnight until the UTC offset had passed.)
   */
  protected plantedAgo(plant: Plant): string {
    const planted = Date.parse(plant.plantationDate);
    if (!Number.isFinite(planted)) {
      return '';
    }
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
    const days = today - Math.floor(planted / DAY_MS);
    // Every count below is at least 2 — the singulars are the words themselves.
    if (days < 0) {
      return days === -1 ? $localize`Tomorrow` : $localize`In ${-days}:count: days`;
    }
    if (days === 0) {
      return $localize`Today`;
    }
    if (days === 1) {
      return $localize`Yesterday`;
    }
    if (days < 14) {
      return $localize`${days}:count: days ago`;
    }
    if (days < 60) {
      return $localize`${Math.round(days / 7)}:count: weeks ago`;
    }
    return days < 730
      ? $localize`${Math.round(days / 30)}:count: months ago`
      : $localize`${Math.round(days / 365)}:count: years ago`;
  }

  /** Chart column → map selection, with the plan brought into view to show the bed. */
  protected findOnPlan(plantId: number): void {
    this.selectedPlantId.set(plantId);
    const heading = document.getElementById('map-heading');
    if (heading) {
      heading.scrollIntoView({ block: 'start' });
    }
  }

  /** Table row → map selection (the map centers it; two-way via model). */
  protected selectOnMap(plant: Plant): void {
    this.selectedPlantId.set(this.selectedPlantId() === plant.plantId ? null : plant.plantId);
  }

  protected isMutating(plantId: number): boolean {
    return (
      this.store.pendingDeletes().includes(plantId) || this.store.pendingUpdates().includes(plantId)
    );
  }

  protected gardenUpdating(gardenId: number): boolean {
    return this.gardensStore.pendingUpdates().includes(gardenId);
  }

  // ── Planner actions (visual layout only — capacity math never involved) ──
  private persistPositions(next: LayoutPositions): void {
    this.positions.set(next);
    const id = this.gardenId();
    this.layoutRepo.save(
      id,
      next,
      this.store.plants().map((p) => p.plantId),
    );
  }

  /** Every layout change is one step on a bounded stack; a new step clears redo. */
  private pushHistory(): void {
    this.layoutPast.set([...this.layoutPast(), this.positions()].slice(-20));
    this.layoutFuture.set([]);
  }

  protected onPositionChange(move: { plantId: number; x: number; y: number }): void {
    this.pushHistory();
    this.persistPositions({ ...this.positions(), [move.plantId]: { x: move.x, y: move.y } });
  }

  /** One bed back to its automatic spot — undoable like any move. */
  protected onResetPosition(plantId: number): void {
    if (!this.positions()[plantId]) {
      return;
    }
    this.pushHistory();
    const rest: Record<number, { x: number; y: number }> = { ...this.positions() };
    delete rest[plantId];
    this.persistPositions(rest);
  }

  /** "Group by water needs": a whole new arrangement, committed as ONE undoable step. */
  protected onArrange(next: LayoutPositions): void {
    this.pushHistory();
    this.persistPositions({ ...next });
  }

  protected undoLayout(): void {
    const past = this.layoutPast();
    if (past.length === 0) {
      return;
    }
    this.layoutFuture.set([this.positions(), ...this.layoutFuture()]);
    this.layoutPast.set(past.slice(0, -1));
    this.persistPositions(past[past.length - 1]);
  }

  protected redoLayout(): void {
    const future = this.layoutFuture();
    if (future.length === 0) {
      return;
    }
    this.layoutPast.set([...this.layoutPast(), this.positions()].slice(-20));
    this.layoutFuture.set(future.slice(1));
    this.persistPositions(future[0]);
  }

  protected async resetLayout(): Promise<void> {
    if (!this.hasCustomLayout()) {
      return;
    }
    const confirmed = await this.confirm.confirm({
      title: $localize`Reset layout?`,
      message: $localize`Your custom plant positions will return to the automatic arrangement.`,
      confirmLabel: $localize`Reset layout`,
      destructive: false,
    });
    if (confirmed) {
      this.layoutPast.set([...this.layoutPast(), this.positions()].slice(-20));
      this.layoutFuture.set([]);
      this.positions.set({});
      this.layoutRepo.reset(this.gardenId());
    }
  }

  protected toggleFullscreen(): void {
    const next = !this.plannerFullscreen();
    this.plannerFullscreen.set(next);
    // Lock page scroll behind the fullscreen planner overlay.
    document.body.style.overflow = next ? 'hidden' : '';
  }

  /** Fullscreen search: Enter focuses the first matching plant. */
  protected focusSearchMatch(): void {
    const q = this.plannerQuery().trim().toLowerCase();
    if (!q) {
      return;
    }
    const match = this.store
      .plants()
      .find((p) => p.plantName.toLowerCase().includes(q) || p.species.toLowerCase().includes(q));
    if (match) {
      this.selectedPlantId.set(match.plantId);
    }
  }
}
