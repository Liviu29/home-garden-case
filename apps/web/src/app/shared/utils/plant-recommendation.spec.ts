import { Garden, Plant } from '../../core/api/models';
import { PLANT_CATALOG, searchCatalog } from '../config/plant-catalog';
import { calculatePlantRecommendation, rankCatalog } from './plant-recommendation';

const garden = (over: Partial<Garden> = {}): Garden => ({
  gardenId: 1,
  gardenName: 'G',
  totalSurfaceArea: 10,
  targetHumidityLevel: 50,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const plant = (name: string, species: string, area: number): Plant => ({
  plantId: 1,
  plantName: name,
  species,
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: area,
  idealHumidityLevel: 50,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

const preset = PLANT_CATALOG.find((p) => p.id === 'lavender')!; // 1 m², 45%

describe('calculatePlantRecommendation (deterministic, transparent)', () => {
  it('scores a close-humidity, fitting, novel plant as an excellent match', () => {
    const rec = calculatePlantRecommendation(preset, garden({ targetHumidityLevel: 45 }), []);
    expect(rec.humidityMatch).toBe('excellent');
    expect(rec.fitsAvailableArea).toBe(true);
    expect(rec.alreadyPlanted).toBe(false);
    expect(rec.score).toBe(60 + 30 + 10); // full marks, no magic numbers
    expect(rec.reasons.join(' ')).toContain('Fits the 10 m² still free');
  });

  it('is honest when the plant does not fit the remaining area', () => {
    const rec = calculatePlantRecommendation(
      preset,
      garden(),
      [plant('Big', 'Big', 9.5)], // 0.5 m² left, lavender wants 1
    );
    expect(rec.fitsAvailableArea).toBe(false);
    expect(rec.reasons.join(' ')).toContain('Needs 1 m² — only 0.5 m² free');
    expect(rec.score).toBeLessThan(calculatePlantRecommendation(preset, garden(), []).score);
  });

  it('flags humidity mismatch with the truthful delta, never hiding the plant', () => {
    const rec = calculatePlantRecommendation(preset, garden({ targetHumidityLevel: 80 }), []);
    expect(rec.humidityMatch).toBe('off');
    expect(rec.humidityDelta).toBe(35);
    expect(rec.reasons.join(' ')).toContain('35% off your target');
  });

  it('applies the variety bonus only for species not already planted', () => {
    const fresh = calculatePlantRecommendation(preset, garden(), []);
    const repeated = calculatePlantRecommendation(preset, garden(), [
      plant('Lavender', 'Lavandula angustifolia', 1),
    ]);
    expect(fresh.score - repeated.score).toBe(10);
    expect(repeated.alreadyPlanted).toBe(true);
  });

  it('is a pure function: identical inputs give identical results', () => {
    const g = garden();
    expect(calculatePlantRecommendation(preset, g, [])).toEqual(
      calculatePlantRecommendation(preset, g, []),
    );
  });
});

describe('rankCatalog', () => {
  it('sorts best matches first with a stable name tiebreak', () => {
    const ranked = rankCatalog(PLANT_CATALOG, garden({ targetHumidityLevel: 45 }), []);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
    // Lavender (45%) should outrank the fern (75%) for a 45% garden
    const lavenderIdx = ranked.findIndex((r) => r.preset.id === 'lavender');
    const fernIdx = ranked.findIndex((r) => r.preset.id === 'fern');
    expect(lavenderIdx).toBeLessThan(fernIdx);
  });
});

describe('searchCatalog', () => {
  it('matches common and scientific names, case-insensitively', () => {
    expect(searchCatalog('lav').map((p) => p.id)).toContain('lavender');
    expect(searchCatalog('SOLANUM').map((p) => p.id)).toContain('tomato');
  });

  it('returns the full catalog for a blank query', () => {
    expect(searchCatalog('  ')).toHaveLength(PLANT_CATALOG.length);
  });
});
