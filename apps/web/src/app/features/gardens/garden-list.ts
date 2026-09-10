import { computed, inject, ChangeDetectionStrategy, Component, Injector } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Garden, Plant } from '../../core/api/models';
import { usedSurfaceArea } from '../../shared/utils/garden-insights';
import { PlantsIndexStore } from './plants-index-store';
import { CapacityBar } from '../../shared/ui/capacity-bar/capacity-bar';
import { CapacityStatusChip } from '../../shared/ui/capacity-status/capacity-status';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { SkeletonGroup } from '../../shared/ui/skeleton/skeleton-group';
import { SkeletonGardenCard } from '../../shared/ui/skeleton/skeleton-garden-card';
import { GardenFormDialog } from './garden-form-dialog';
import { GardensStore } from './gardens-store';
import { GARDEN_SORT_LABEL, GardenSort, filterAndSortGardens } from './garden-view';
import { PrefetchGarden } from './prefetch-garden';
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

  /** The source the plants index follows; the store owns the fan-out itself. */
  private readonly gardenIds = computed(() => this.store.gardens().map((g) => g.gardenId));

  constructor() {
    void this.store.load();
    // Declare the source once. No component-level effect, no writes from here
    // into a shared store — the index enriches cards as gardens arrive (F-02).
    this.plantsIndex.ensureForGardens(this.gardenIds, { injector: inject(Injector) });
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
      title: 'Delete garden?',
      message: `“${garden.gardenName}” and all of its plants will be permanently deleted.`,
      confirmLabel: 'Delete',
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
