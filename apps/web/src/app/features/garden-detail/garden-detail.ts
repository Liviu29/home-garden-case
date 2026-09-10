import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Garden, Plant } from '../../core/api/models';
import { CapacityBar } from '../../shared/ui/capacity-bar/capacity-bar';
import { CapacityStatusChip } from '../../shared/ui/capacity-status/capacity-status';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { HumidityGauge } from '../../shared/ui/humidity-gauge/humidity-gauge';
import { PlantArtworkDefs } from '../../shared/ui/plant-visuals/plant-artwork-defs';
import { PlantThumb } from '../../shared/ui/plant-visuals/plant-thumb';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { SkeletonGroup } from '../../shared/ui/skeleton/skeleton-group';
import { GardenFormDialog } from '../gardens/garden-form-dialog';
import { GardensStore } from '../gardens/gardens-store';
import { GardenDetailStore } from './garden-detail-store';
import { GardenLayoutRepository, LayoutPositions } from './garden-map/garden-layout-repository';
import { GardenMap } from './garden-map/garden-map';
import { GardenMapSkeleton } from './garden-map/garden-map-skeleton';
import { PlantFormDialog } from './plant-form-dialog';

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

  // ── Planner UI state (feature brief §15–20, §62): local to this screen.
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
        // state, no request issued (REM-001).
        this.store.markMissing();
      }
    });
    // Route title refines from 'Garden · HomeGarden' to the actual name (REM-006).
    effect(() => {
      const garden = this.store.garden();
      if (garden) {
        this.title.setTitle(`${garden.gardenName} · HomeGarden`);
      }
    });
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
    // §30: a freshly planted bed becomes the selection, so the map centers
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
    return plant.idealHumidityLevel - garden.targetHumidityLevel;
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

  protected onPositionChange(move: { plantId: number; x: number; y: number }): void {
    const past = [...this.layoutPast(), this.positions()].slice(-20); // bounded history
    this.layoutPast.set(past);
    this.layoutFuture.set([]);
    this.persistPositions({ ...this.positions(), [move.plantId]: { x: move.x, y: move.y } });
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

  /** Fullscreen search (§43): Enter focuses the first matching plant. */
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
