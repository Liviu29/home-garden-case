import { Garden, Plant } from '../../core/api/models';
import { applyPositions, computeGardenMapLayout } from '../garden-map-layout/garden-map-layout';
import {
  CONFLICT_MIN_DELTA,
  arrangeByWateringZone,
  boxGap,
  findNeighbours,
  findWateringConflicts,
  largestFreeRect,
  plantedBy,
  plantingDay,
  plantingDays,
  wateringZone,
  zoneBreakdown,
} from './garden-planner';

const garden = (totalSurfaceArea: number): Garden => ({
  gardenId: 1,
  gardenName: 'G',
  totalSurfaceArea,
  targetHumidityLevel: 60,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
});

const plant = (
  plantId: number,
  surfaceAreaRequired: number,
  idealHumidityLevel = 50,
  plantationDate = '2026-04-01T00:00:00.000Z',
): Plant => ({
  plantId,
  plantName: `Plant ${plantId}`,
  species: 's',
  plantType: 'vegetable',
  plantationDate,
  surfaceAreaRequired,
  idealHumidityLevel,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

const overlapping = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w - 1e-9 &&
  b.x < a.x + a.w - 1e-9 &&
  a.y < b.y + b.h - 1e-9 &&
  b.y < a.y + a.h - 1e-9;

describe('largestFreeRect (where the free soil really is)', () => {
  it('is exactly the free treemap cell in the automatic arrangement', () => {
    // 75% full: the beds partition the whole surface, one free cell remains
    const layout = computeGardenMapLayout(garden(20), [plant(1, 15)]);
    const spot = largestFreeRect(layout, layout.plots)!;
    const band = layout.freeBand!;
    expect(spot.x).toBeCloseTo(band.x, 9);
    expect(spot.y).toBeCloseTo(band.y, 9);
    expect(spot.w).toBeCloseTo(band.w, 9);
    expect(spot.h).toBeCloseTo(band.h, 9);
  });

  it('follows the open ground after a bed is moved — never under a bed', () => {
    // A bed dragged off its corner, into the open ground
    const auto = computeGardenMapLayout(garden(20), [plant(1, 5)]);
    const moved = applyPositions(auto, { 1: { x: 0.5, y: 0 } });
    const spot = largestFreeRect(moved, moved.plots)!;
    expect(overlapping(spot, moved.plots[0])).toBe(false);
    // The right-hand side beats the 0.5 m strip the bed left behind it.
    expect(spot.x).toBeCloseTo(0.5 + moved.plots[0].w, 9);
  });

  it('is the whole surface when nothing is planted, and null when it is all beds', () => {
    expect(largestFreeRect({ width: 4, height: 2 }, [])).toEqual({ x: 0, y: 0, w: 4, h: 2 });
    const full = computeGardenMapLayout(garden(10), [plant(1, 6), plant(2, 4)]);
    expect(largestFreeRect(full, full.plots)).toBeNull();
    expect(largestFreeRect({ width: 0, height: 2 }, [])).toBeNull();
  });

  it('ignores beds with no footprint', () => {
    const spot = largestFreeRect({ width: 4, height: 2 }, [{ x: 1, y: 1, w: 0, h: 0 }]);
    expect(spot).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });
});

describe('watering zones', () => {
  it('bands a preference to the nearest of the form presets (40 · 60 · 80)', () => {
    expect(wateringZone(20)).toBe('dry');
    expect(wateringZone(49)).toBe('dry');
    expect(wateringZone(50)).toBe('balanced');
    expect(wateringZone(69)).toBe('balanced');
    expect(wateringZone(70)).toBe('humid');
    expect(wateringZone(100)).toBe('humid');
  });

  it('splits the planted area across the zones; the shares sum to one', () => {
    const shares = zoneBreakdown([
      plant(1, 3, 30),
      plant(2, 1, 60),
      plant(3, 4, 85),
      plant(4, 0, 90),
    ]);
    expect(shares.map((s) => [s.zone, s.plants, s.area])).toEqual([
      ['dry', 1, 3],
      ['balanced', 1, 1],
      ['humid', 1, 4], // the zero-area plant is not planted surface
    ]);
    expect(shares.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 9);
  });

  it('reports empty zones as zero, never NaN', () => {
    expect(zoneBreakdown([]).every((s) => s.share === 0 && s.area === 0)).toBe(true);
  });
});

describe('findWateringConflicts (neighbours that cannot share a watering pass)', () => {
  const humidity: Record<number, number> = { 1: 30, 2: 80, 3: 35, 4: 90 };
  const of = (id: number) => humidity[id];

  it('flags touching beds whose preferences are far apart, strongest first', () => {
    const plots = [
      { plantId: 1, x: 0, y: 0, w: 1, h: 1 },
      { plantId: 2, x: 1, y: 0, w: 1, h: 1 }, // touches 1: 50 points apart
      { plantId: 3, x: 0, y: 1, w: 1, h: 1 }, // touches 1: only 5 apart
      { plantId: 4, x: 1, y: 1, w: 1, h: 1 }, // touches 3 (55) and 2 (10)
    ];
    // Corner contact counts as touching; 1-3 (5) and 2-4 (10) are compatible.
    const conflicts = findWateringConflicts(plots, of);
    expect(conflicts.map((c) => [`${c.a}-${c.b}`, c.delta])).toEqual([
      ['1-4', 60],
      ['3-4', 55],
      ['1-2', 50],
      ['2-3', 45],
    ]);
    expect(conflicts.every((c) => c.delta >= CONFLICT_MIN_DELTA)).toBe(true);
  });

  it('ignores beds that are far apart, and plants it knows nothing about', () => {
    const plots = [
      { plantId: 1, x: 0, y: 0, w: 1, h: 1 },
      { plantId: 2, x: 3, y: 0, w: 1, h: 1 },
      { plantId: 9, x: 1, y: 0, w: 1, h: 1 },
    ];
    expect(findWateringConflicts(plots, of)).toEqual([]);
  });

  it('marks each conflict on the edge where the two beds meet', () => {
    const [c] = findWateringConflicts(
      [
        { plantId: 2, x: 1, y: 0.5, w: 1, h: 2 },
        { plantId: 1, x: 0, y: 0, w: 1, h: 2 },
      ],
      of,
    );
    // Side by side: the shared stretch of the x = 1 edge, badge in its middle.
    expect(c).toEqual({
      a: 1,
      b: 2,
      delta: 50,
      edge: { x1: 1, y1: 0.5, x2: 1, y2: 2 },
      at: { x: 1, y: 1.25 },
    });
  });

  it('marks beds across a small gap in the middle of the gap', () => {
    const [c] = findWateringConflicts(
      [
        { plantId: 1, x: 0, y: 0, w: 1, h: 1 },
        { plantId: 2, x: 0, y: 1.2, w: 1, h: 1 },
      ],
      of,
    );
    expect([c.edge.x1, c.edge.x2, c.at.x]).toEqual([0, 1, 0.5]);
    for (const y of [c.edge.y1, c.edge.y2, c.at.y]) {
      expect(y).toBeCloseTo(1.1, 9);
    }
  });

  it('measures the gap between boxes, zero when they touch', () => {
    expect(boxGap({ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 })).toBe(0);
    expect(boxGap({ x: 0, y: 0, w: 1, h: 1 }, { x: 4, y: 5, w: 1, h: 1 })).toBe(5);
  });
});

describe('arrangeByWateringZone ("Group by water needs")', () => {
  const plants = [plant(1, 4, 85), plant(2, 3, 30), plant(3, 2, 60), plant(4, 1, 35)];
  const humidityOf = (id: number) => plants.find((p) => p.plantId === id)?.idealHumidityLevel;

  it('re-places every bed inside the garden with no overlaps, footprints unchanged', () => {
    const layout = computeGardenMapLayout(garden(20), plants);
    const positions = arrangeByWateringZone(layout, layout.plots, humidityOf)!;
    expect(Object.keys(positions).map(Number).sort()).toEqual([1, 2, 3, 4]);
    const arranged = applyPositions(layout, positions).plots;
    for (const p of arranged) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x + p.w).toBeLessThanOrEqual(layout.width + 1e-9);
      expect(p.y + p.h).toBeLessThanOrEqual(layout.height + 1e-9);
    }
    for (let i = 0; i < arranged.length; i++) {
      for (let j = i + 1; j < arranged.length; j++) {
        expect(overlapping(arranged[i], arranged[j])).toBe(false);
      }
    }
  });

  it('starts with the driest beds at the top-left and ends with the most humid', () => {
    const layout = computeGardenMapLayout(garden(20), plants);
    const positions = arrangeByWateringZone(layout, layout.plots, humidityOf)!;
    // Driest (30%) takes the origin; the humid bed (85%) is placed last.
    expect(positions[2]).toEqual({ x: 0, y: 0 });
    const reading = (id: number) => positions[id].y * 1000 + positions[id].x;
    expect(reading(1)).toBeGreaterThan(reading(2));
  });

  it('is deterministic', () => {
    const layout = computeGardenMapLayout(garden(20), plants);
    expect(arrangeByWateringZone(layout, layout.plots, humidityOf)).toEqual(
      arrangeByWateringZone(layout, layout.plots, humidityOf),
    );
  });

  it('falls back to columns when rows cannot hold the beds', () => {
    // Two full-height beds side by side: rows fail (each row is full height),
    // columns stack them left to right.
    const surface = { width: 3, height: 2 };
    const plots = [
      { plantId: 1, x: 0, y: 0, w: 1.5, h: 2 },
      { plantId: 2, x: 1.5, y: 0, w: 1.5, h: 1 },
      { plantId: 3, x: 1.5, y: 1, w: 1.5, h: 1 },
    ];
    const hum = (id: number) => ({ 1: 80, 2: 30, 3: 60 })[id];
    const positions = arrangeByWateringZone(surface, plots, hum)!;
    expect(positions).not.toBeNull();
    const arranged = plots.map((p) => ({ ...p, ...positions[p.plantId] }));
    for (let i = 0; i < arranged.length; i++) {
      for (let j = i + 1; j < arranged.length; j++) {
        expect(overlapping(arranged[i], arranged[j])).toBe(false);
      }
    }
  });

  it('returns null when no overlap-free grouping exists', () => {
    const surface = { width: 2, height: 2 };
    const plots = [
      { plantId: 1, x: 0, y: 0, w: 1.5, h: 1.5 },
      { plantId: 2, x: 0, y: 0, w: 1.5, h: 1.5 },
    ];
    expect(arrangeByWateringZone(surface, plots, () => 50)).toBeNull();
  });

  it('treats a plant with no known humidity as the driest and skips empty footprints', () => {
    const surface = { width: 4, height: 2 };
    const plots = [
      { plantId: 1, x: 0, y: 0, w: 1, h: 1 },
      { plantId: 2, x: 0, y: 0, w: 0, h: 0 },
    ];
    expect(arrangeByWateringZone(surface, plots, () => undefined)).toEqual({ 1: { x: 0, y: 0 } });
  });
});

describe('planting timeline', () => {
  const plants = [
    plant(1, 1, 50, '2026-04-03T10:00:00.000Z'),
    plant(2, 1, 50, '2026-04-01T00:00:00.000Z'),
    plant(3, 1, 50, '2026-04-03T23:00:00.000Z'),
    plant(4, 1, 50, 'not a date'),
  ];

  it('lists each distinct planting day once, oldest first', () => {
    expect(plantingDays(plants)).toEqual(['2026-04-01', '2026-04-03']);
  });

  it('reads the UTC calendar day of a date, and null for nonsense', () => {
    expect(plantingDay('2026-04-03T23:30:00.000Z')).toBe('2026-04-03');
    expect(plantingDay('nope')).toBeNull();
  });

  it('knows what was in the ground on a day; unreadable dates always are', () => {
    expect([...plantedBy(plants, '2026-04-01')].sort()).toEqual([2, 4]);
    expect([...plantedBy(plants, '2026-04-03')].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('neighbours', () => {
  const box = (plantId: number, x: number, y: number) => ({ plantId, x, y, w: 1, h: 1 });
  //  1 2          4 far away
  //  6  3         (3 sits 0.2 m right of 6 and 0.1 m below 2)
  const plots = [box(1, 0, 0), box(2, 1, 0), box(3, 1.2, 1.1), box(4, 5, 5), box(6, 0, 1)];

  it('lists the beds within a watering pass of each bed, nearest first, then by id', () => {
    const near = findNeighbours(plots);

    expect(near.get(1)).toEqual([2, 6, 3]); // 2 and 6 touch it (tie → by id), 3 is 0.22 m off
    expect(near.get(3)).toEqual([2, 6, 1]); // 0.1 m, 0.2 m, 0.22 m
    expect(near.get(4)).toEqual([]);
  });

  it('takes the distance that counts as "next to" as an option', () => {
    const touching = findNeighbours(plots, 0);

    expect(touching.get(1)).toEqual([2, 6]);
    expect(touching.get(3)).toEqual([]);
  });
});
