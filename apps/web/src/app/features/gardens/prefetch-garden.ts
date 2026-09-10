import { Directive, inject, input } from '@angular/core';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';

/**
 * Pointer-intent prefetch (PERFORMANCE-AND-CACHING.md §client): hovering or
 * focusing a garden card warms the detail + plants cache, so the subsequent
 * navigation renders instantly despite the 200–2000 ms API. QueryCache
 * de-duplication makes repeated hovers free; failures are silent — this is
 * pure progressive enhancement, the detail route loads normally without it.
 */
@Directive({
  selector: '[appPrefetchGarden]',
  host: {
    '(mouseenter)': 'prefetch()',
    '(focusin)': 'prefetch()',
  },
})
export class PrefetchGarden {
  private readonly gardensApi = inject(GardensApi);
  private readonly plantsApi = inject(PlantsApi);
  private readonly cache = inject(QueryCache);

  readonly gardenId = input.required<number>({ alias: 'appPrefetchGarden' });

  protected prefetch(): void {
    const id = this.gardenId();
    this.cache
      .swr(cacheKeys.garden(id), () => this.gardensApi.getById(id))
      .revalidate?.catch(() => undefined);
    this.cache
      .swr(cacheKeys.plantsOfGarden(id), () => this.plantsApi.getByGarden(id))
      .revalidate?.catch(() => undefined);
  }
}
