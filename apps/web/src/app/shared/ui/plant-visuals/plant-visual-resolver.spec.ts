import { PLANT_TYPES, Plant } from '../../../core/api/models';
import { computeVegetation, resolvePlantVisual } from './plant-visual-resolver';

const plant = (
  over: Partial<Plant>,
): Pick<Plant, 'plantId' | 'plantName' | 'species' | 'plantType'> => ({
  plantId: 7,
  plantName: 'Plant',
  species: 'Species',
  plantType: 'vegetable',
  ...over,
});

describe('resolvePlantVisual (presentational classification, never domain)', () => {
  it.each([
    ['Cherry Tomatoes', 'Solanum lycopersicum', 'vegetable'], // tomato beats cherry(tree)
    ['Lavender Border', 'Lavandula angustifolia', 'flower'],
    ['Strawberry Patch', 'Fragaria × ananassa', 'fruit'],
    ['Basil', 'Ocimum basilicum', 'herb'],
    ['Old Oak', 'Quercus robur', 'tree'],
    ['Aloe', 'Aloe vera', 'succulent'],
  ])('classifies "%s" (%s) as %s', (plantName, species, category) => {
    expect(resolvePlantVisual(plant({ plantName, species })).category).toBe(category);
  });

  it('falls back to the domain plantType when no keyword matches', () => {
    expect(
      resolvePlantVisual(plant({ plantName: 'Zzz', species: 'Xxx', plantType: 'flower' })).category,
    ).toBe('flower');
    expect(
      resolvePlantVisual(plant({ plantName: 'Zzz', species: 'Xxx', plantType: 'fruit' })).category,
    ).toBe('fruit');
  });

  it('is deterministic: same plant → identical visual on every call', () => {
    const p = plant({ plantId: 42, plantName: 'Mystery' });
    expect(resolvePlantVisual(p)).toEqual(resolvePlantVisual(p));
  });

  it('varies appearance across different plants of the same category', () => {
    const a = resolvePlantVisual(plant({ plantId: 1, plantName: 'Rose A' }));
    const b = resolvePlantVisual(plant({ plantId: 2, plantName: 'Rose B' }));
    expect(a.category).toBe(b.category);
    expect(a.rotation === b.rotation && a.palette === b.palette).toBe(false);
  });

  it('keeps rotation subtle (top-down plants, not spinning icons)', () => {
    for (let id = 1; id < 40; id++) {
      const { rotation } = resolvePlantVisual(plant({ plantId: id }));
      expect(Math.abs(rotation)).toBeLessThanOrEqual(14);
    }
  });
});

describe('computeVegetation (deterministic growth clusters)', () => {
  it('is deterministic for a given seed and footprint', () => {
    expect(computeVegetation(123, 3, 2, 0.5)).toEqual(computeVegetation(123, 3, 2, 0.5));
  });

  it('renders a small footprint as a single centered specimen', () => {
    const veg = computeVegetation(9, 1.1, 0.8, 0.4);
    expect(veg).toHaveLength(1);
    expect(veg[0].x).toBeCloseTo(0.55, 5);
    expect(veg[0].y).toBeCloseTo(0.4, 5);
  });

  it('grows density with footprint area (a large plant becomes a cluster)', () => {
    const small = computeVegetation(5, 1.2, 1, 0.45);
    const large = computeVegetation(5, 4, 2.5, 0.45);
    expect(large.length).toBeGreaterThan(small.length);
    expect(large.length).toBeLessThanOrEqual(9); // restrained, never a forest
  });

  it('keeps every instance fully inside the footprint', () => {
    for (const seed of [1, 77, 901]) {
      for (const veg of computeVegetation(seed, 3.4, 2.1, 0.4)) {
        expect(veg.x - veg.size / 2).toBeGreaterThanOrEqual(-1e-9);
        expect(veg.y - veg.size / 2).toBeGreaterThanOrEqual(-1e-9);
        expect(veg.x + veg.size / 2).toBeLessThanOrEqual(3.4 + 1e-9);
        expect(veg.y + veg.size / 2).toBeLessThanOrEqual(2.1 + 1e-9);
      }
    }
  });

  it('respects the legibility floor without exceeding the footprint', () => {
    const veg = computeVegetation(3, 0.6, 0.5, 0.45);
    expect(veg[0].size).toBeGreaterThanOrEqual(0.45);
    expect(veg[0].size).toBeLessThanOrEqual(0.5);
  });

  it('treats a zero seed like any other: the cluster still varies', () => {
    const veg = computeVegetation(0, 4, 2.5, 0.45);
    expect(veg.length).toBeGreaterThan(1);
    expect(new Set(veg.map((v) => v.rotation)).size).toBeGreaterThan(1);
  });
});

describe('resolvePlantVisual — every plantType maps to a category', () => {
  const base = {
    plantId: 1,
    plantName: 'Something',
    species: 'sp',
    plantationDate: '2026-04-01T00:00:00.000Z',
    surfaceAreaRequired: 1,
    idealHumidityLevel: 50,
    gardenId: 1,
    createdAt: '',
    updatedAt: '',
  };

  it.each(PLANT_TYPES)('%s → a stable category with a palette and rotation', (plantType) => {
    const visual = resolvePlantVisual({ ...base, plantType });

    expect(visual.category).toBeTruthy();
    expect(visual.symbolId).toMatch(/^pv-/);
    expect(visual.palette).toBeTruthy();
    expect(visual.rotation).toBeGreaterThanOrEqual(-14);
    expect(visual.rotation).toBeLessThanOrEqual(14);
  });

  it('is deterministic for the same plant', () => {
    const plant = { ...base, plantType: 'vegetable' as const };
    expect(resolvePlantVisual(plant)).toEqual(resolvePlantVisual(plant));
  });

  it('varies with the plant id, so a bed of the same species is not uniform', () => {
    const a = resolvePlantVisual({ ...base, plantId: 1, plantType: 'vegetable' as const });
    const b = resolvePlantVisual({ ...base, plantId: 2, plantType: 'vegetable' as const });
    expect([a.palette, a.rotation]).not.toEqual([b.palette, b.rotation]);
  });
});
