import type { Garden, Plant } from '../../core/api/models';
import { occupancyRatio } from '../../domain/garden-insights/garden-insights';

/**
 * Pure view logic for the gardens toolbar (search + sort) — kept out of the
 * store and the component so it is trivially unit-testable.
 */

export type GardenSort = 'name' | 'size' | 'utilization';

export const GARDEN_SORT_LABEL: Readonly<Record<GardenSort, string>> = {
  name: $localize`Name`,
  size: $localize`Total size`,
  utilization: $localize`Utilization`,
};

export function filterAndSortGardens(
  gardens: readonly Garden[],
  plantsByGarden: Readonly<Record<number, readonly Plant[]>>,
  query: string,
  sort: GardenSort,
): Garden[] {
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? gardens.filter(
        (g) =>
          g.gardenName.toLowerCase().includes(needle) ||
          (g.locationDescription ?? '').toLowerCase().includes(needle),
      )
    : [...gardens];

  switch (sort) {
    case 'name':
      return matched.sort((a, b) => a.gardenName.localeCompare(b.gardenName));
    case 'size':
      return matched.sort((a, b) => b.totalSurfaceArea - a.totalSurfaceArea);
    case 'utilization':
      // Gardens whose plants haven't loaded yet sort last, not as 0% —
      // "unknown" must never masquerade as "empty".
      return matched.sort(
        (a, b) => utilizationOf(b, plantsByGarden) - utilizationOf(a, plantsByGarden),
      );
  }
}

function utilizationOf(
  garden: Garden,
  plantsByGarden: Readonly<Record<number, readonly Plant[]>>,
): number {
  const plants = plantsByGarden[garden.gardenId];
  return plants === undefined ? -1 : occupancyRatio(garden, plants);
}
