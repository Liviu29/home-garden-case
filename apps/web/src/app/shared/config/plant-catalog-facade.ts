import { Injectable } from '@angular/core';
import { Garden, Plant } from '../../core/api/models';
import { PlantRecommendation, rankCatalog } from '../utils/plant-recommendation';
import { PLANT_CATALOG, PlantPreset, searchCatalog } from './plant-catalog';

/**
 * Provider seam for plant discovery.
 *
 * The LOCAL provider is the shipped implementation: deterministic, offline,
 * CI-safe, zero credentials — the assignment must never depend on an API key.
 * An external provider (e.g. Perenual's species API) would implement this
 * same interface and be *composed* by the facade with the local catalog as
 * guaranteed fallback; it is deliberately NOT implemented here — the seam is
 * the deliverable, the dependency is not (documented in
 * docs/design/INTERACTIVE-GARDEN-UX.md).
 */
export interface PlantCatalogProvider {
  search(query: string): Promise<readonly PlantPreset[]>;
  getRecommendations(
    garden: Garden,
    plants: readonly Plant[],
  ): Promise<readonly PlantRecommendation[]>;
}

@Injectable({ providedIn: 'root' })
export class PlantCatalogFacade implements PlantCatalogProvider {
  /** Local search is synchronous under the hood — instant, no debounce needed. */
  search(query: string): Promise<readonly PlantPreset[]> {
    return Promise.resolve(searchCatalog(query));
  }

  getRecommendations(
    garden: Garden,
    plants: readonly Plant[],
  ): Promise<readonly PlantRecommendation[]> {
    return Promise.resolve(rankCatalog(PLANT_CATALOG, garden, plants));
  }

  /** Synchronous accessors for the dialog (local provider guarantees them). */
  searchSync(query: string): readonly PlantPreset[] {
    return searchCatalog(query);
  }

  recommendSync(garden: Garden, plants: readonly Plant[]): readonly PlantRecommendation[] {
    return rankCatalog(PLANT_CATALOG, garden, plants);
  }
}
