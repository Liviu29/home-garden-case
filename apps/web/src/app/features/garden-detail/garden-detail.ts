import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet, TitleCasePipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Garden, Plant } from '../../core/api/models';
import { plantHumidityDelta } from '../../domain/garden-insights/garden-insights';
import { WateringZone, wateringZone } from '../../domain/garden-planner/garden-planner';
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
import { GardenDetailStore } from './garden-detail-store/garden-detail-store';
import {
  GardenLayoutRepository,
  LayoutPositions,
} from '../../state/garden-layout/garden-layout-repository';
import { GardenMap } from './garden-map/garden-map';
import { GardenMapSkeleton } from './garden-map/garden-map-skeleton/garden-map-skeleton';
import { PlantFormDialog } from './plant-form-dialog/plant-form-dialog';
import { ThemeStore } from '../../core/config/theme-store';
import { Chart } from '../../shared/ui/chart/chart';
import { readChartPalette } from '../../shared/ui/chart/chart-palette';
import { HighchartsLoader } from '../../shared/ui/chart/highcharts-loader';
import { humidityProfileOptions } from './humidity-profile/humidity-profile-options';

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
    TitleCasePipe,
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
  ],
  templateUrl: './garden-detail.html',
  styleUrl: './garden-detail.scss',
})
export class GardenDetail {
  protected readonly store = inject(GardenDetailStore);
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
  protected readonly positions = signal<LayoutPositions>({});
  private readonly layoutPast = signal<readonly LayoutPositions[]>([]);
  private readonly layoutFuture = signal<readonly LayoutPositions[]>([]);
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

  /** From the route: /gardens/:gardenId */
  readonly gardenId = input.required({ transform: numberAttribute });

  /** Retry after a transient read failure (5xx/network — not a 404). */
  protected retryGarden(): void {
    const id = this.gardenId();
    if (Number.isFinite(id) && Number.isInteger(id) && id >= 1) {
      this.store.load(id);
    }
  }

  constructor() {
    effect(() => {
      const id = this.gardenId();
      if (Number.isFinite(id) && Number.isInteger(id) && id >= 1) {
        this.store.load(id);
        // Restore this garden's locally-persisted visual layout (UI pref).
        this.positions.set(this.layoutRepo.load(id));
        this.layoutPast.set([]);
        this.layoutFuture.set([]);
      } else {
        // Malformed deep link (/gardens/abc, /gardens/-1): designed not-found
        // state, no request issued.
        this.store.markMissing();
      }
    });
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
      data: { garden, plants: this.store.plants(), plant, store: this.store },
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
    return plantHumidityDelta(garden, plant);
  }

  protected zoneOf(plant: Plant): WateringZone {
    return wateringZone(plant.idealHumidityLevel);
  }

  // ── Plants table sorting: presentation only — the store order is untouched ─
  protected readonly sortColumns: readonly {
    readonly key: PlantSortKey;
    readonly label: string;
    readonly num: boolean;
  }[] = [
    { key: 'name', label: 'Plant', num: false },
    { key: 'planted', label: 'Planted', num: false },
    { key: 'area', label: 'Area', num: true },
    { key: 'humidity', label: 'Humidity', num: true },
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
    if (days < 0) {
      return days === -1 ? 'Tomorrow' : `In ${-days} days`;
    }
    if (days === 0) {
      return 'Today';
    }
    if (days === 1) {
      return 'Yesterday';
    }
    if (days < 14) {
      return `${days} days ago`;
    }
    if (days < 60) {
      return `${Math.round(days / 7)} weeks ago`;
    }
    return days < 730
      ? `${Math.round(days / 30)} months ago`
      : `${Math.round(days / 365)} years ago`;
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
      title: 'Reset layout?',
      message: 'Your custom plant positions will return to the automatic arrangement.',
      confirmLabel: 'Reset layout',
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
