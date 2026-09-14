import {
  afterRenderEffect,
  computed,
  inject,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import type { Garden, Plant } from '../../core/api/models';
import { usedSurfaceArea } from '../../domain/garden-insights/garden-insights';
import { PlantsIndexStore } from '../../state/plants-index-store/plants-index-store';
import { CapacityBar } from '../../shared/ui/capacity-bar/capacity-bar';
import { CapacityStatusChip } from '../../shared/ui/capacity-status/capacity-status';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { SkeletonGroup } from '../../shared/ui/skeleton/skeleton-group';
import { SkeletonGardenCard } from '../../shared/ui/skeleton/skeleton-garden-card';
import { GardenFormDialog } from './garden-form-dialog/garden-form-dialog';
import { GardensStore } from '../../state/gardens-store/gardens-store';
import {
  GARDEN_SORT_LABEL,
  type GardenSort,
  filterAndSortGardens,
} from '../../state/gardens-store/garden-view';
import { PrefetchGarden } from './prefetch-garden/prefetch-garden';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

/**
 * Gardens overview: card grid with skeleton-first rendering, staggered entry,
 * designed empty/error states, and optimistic delete.
 */
@Component({
  selector: 'app-garden-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatButtonModule,
    MatMenuModule,
    PageHeader,
    Skeleton,
    SkeletonGroup,
    SkeletonGardenCard,
    EmptyState,
    CapacityBar,
    CapacityStatusChip,
    PrefetchGarden,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './garden-list.html',
  styleUrl: './garden-list.scss',
})
export class GardenList {
  protected readonly store = inject(GardensStore);
  protected readonly plantsIndex = inject(PlantsIndexStore);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The source the plants index follows; the store owns the loading itself. */
  private readonly gardenIds = computed(() => this.store.gardens().map((g) => g.gardenId));

  /** Created before this screen opened — not "new" when the user comes back. */
  private readonly createdBefore = this.store.lastCreatedId();

  /** A garden created while this screen is open: it glows and scrolls into view. */
  protected readonly newGardenId = computed(() => {
    const id = this.store.lastCreatedId();
    return id !== this.createdBefore ? id : null;
  });

  constructor() {
    void this.store.load();
    // Declare the source once. No component-level effect, no writes from here
    // into a shared store — the index enriches cards as gardens arrive.
    this.plantsIndex.ensureForGardens(this.gardenIds, { injector: inject(Injector) });

    // The new card lands in its sorted place — often below the fold, while the
    // creation ghost sat at the end of the grid. Bring it into view once, right
    // after the render that inserted it (DOM work only — no signal writes).
    afterRenderEffect(() => {
      const id = this.newGardenId();
      if (id === null) {
        return;
      }
      const reduce =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.host.nativeElement
        .querySelector(`[data-garden-id="${id}"]`)
        ?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  protected readonly sortOptions = Object.entries(GARDEN_SORT_LABEL) as [GardenSort, string][];

  /** Toolbar-filtered view; unknown-utilization gardens sort last, never as 0%. */
  protected readonly visibleGardens = computed(() =>
    filterAndSortGardens(
      this.store.gardens(),
      this.plantsIndex.byGarden(),
      this.store.query(),
      this.store.sort(),
    ),
  );

  protected readonly noMatches = computed(
    () => this.store.gardens().length > 0 && this.visibleGardens().length === 0,
  );

  protected plantsOf(garden: Garden): readonly Plant[] | undefined {
    return this.plantsIndex.byGarden()[garden.gardenId];
  }

  /** Plants could not load for this card — it says so instead of a forever ghost. */
  protected plantsFailed(garden: Garden): boolean {
    return this.plantsIndex.failed()[garden.gardenId] === true;
  }

  protected usedArea(plants: readonly Plant[]): number {
    return usedSurfaceArea(plants);
  }

  /** Card renders as a mutation ghost while its PUT/DELETE is in flight. */
  protected isCardMutating(gardenId: number): boolean {
    return (
      this.store.pendingDeletes().includes(gardenId) ||
      this.store.pendingUpdates().includes(gardenId)
    );
  }

  protected openCreate(): void {
    this.dialog.open(GardenFormDialog, { data: { garden: null } });
  }

  protected openEdit(garden: Garden): void {
    this.dialog.open(GardenFormDialog, { data: { garden } });
  }

  protected async remove(garden: Garden): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: $localize`Delete garden?`,
      message: $localize`“${garden.gardenName}:name:” and all of its plants will be deleted.`,
      confirmLabel: $localize`Delete`,
      destructive: true,
    });
    if (confirmed) {
      void this.store.remove(garden);
    }
  }

  protected retry(): void {
    void this.store.load();
  }
}
