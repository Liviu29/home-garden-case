import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { effect } from '@angular/core';
import { Garden, Plant } from '../../core/api/models';
import { usedSurfaceArea } from '../../shared/utils/garden-insights';
import { PlantsIndexStore } from './plants-index-store';
import { CapacityBar } from '../../shared/ui/capacity-bar/capacity-bar';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { SkeletonGroup } from '../../shared/ui/skeleton/skeleton-group';
import { GardenFormDialog } from './garden-form-dialog';
import { GardensStore } from './gardens-store';

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
    EmptyState,
    CapacityBar,
  ],
  templateUrl: './garden-list.html',
  styleUrl: './garden-list.scss',
})
export class GardenList {
  protected readonly store = inject(GardensStore);
  protected readonly plantsIndex = inject(PlantsIndexStore);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);

  constructor() {
    void this.store.load();
    // Enrich cards with occupancy as gardens (or new gardens) arrive.
    effect(() => {
      const ids = this.store.gardens().map((g) => g.gardenId);
      if (ids.length > 0) {
        this.plantsIndex.loadFor(ids);
      }
    });
  }

  protected plantsOf(garden: Garden): readonly Plant[] | undefined {
    return this.plantsIndex.byGarden()[garden.gardenId];
  }

  protected usedArea(plants: readonly Plant[]): number {
    return usedSurfaceArea(plants);
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
