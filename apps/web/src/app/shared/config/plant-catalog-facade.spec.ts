import { TestBed } from '@angular/core/testing';
import { Garden, Plant } from '../../core/api/models';
import { PlantCatalogFacade } from './plant-catalog-facade';

const garden: Garden = {
  gardenId: 1,
  gardenName: 'G',
  totalSurfaceArea: 20,
  targetHumidityLevel: 60,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

const plants: readonly Plant[] = [];

/**
 * The provider seam (ADR / INTERACTIVE-GARDEN-UX): the LOCAL implementation is
 * what ships, and its guarantee is that discovery never needs a network call
 * or a credential. The async and sync accessors must therefore agree — the
 * dialog uses the sync ones precisely because the local provider can promise
 * that, and a future remote provider would only be able to honour the async pair.
 */
describe('PlantCatalogFacade (local provider)', () => {
  let facade: PlantCatalogFacade;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    facade = TestBed.inject(PlantCatalogFacade);
  });

  it('searches the catalog asynchronously', async () => {
    const results = await facade.search('tom');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.commonName.toLowerCase().includes('tom'))).toBe(true);
  });

  it('returns the same results synchronously as asynchronously', async () => {
    expect(facade.searchSync('bas')).toEqual(await facade.search('bas'));
  });

  it('ranks recommendations asynchronously', async () => {
    const ranked = await facade.getRecommendations(garden, plants);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]).toHaveProperty('preset');
  });

  it('returns the same recommendations synchronously as asynchronously', async () => {
    expect(facade.recommendSync(garden, plants)).toEqual(
      await facade.getRecommendations(garden, plants),
    );
  });

  it('never rejects — the local provider has no failure mode to surface', async () => {
    await expect(facade.search('')).resolves.toBeDefined();
    await expect(facade.getRecommendations(garden, plants)).resolves.toBeDefined();
  });
});
