import { Garden, Plant } from '../../core/api/models';
import { computeGardenMapLayout } from './garden-map-layout';

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

const plant = (plantId: number, surfaceAreaRequired: number): Plant => ({
  plantId,
  plantName: `Plant ${plantId}`,
  species: 's',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired,
  idealHumidityLevel: 50,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

describe('computeGardenMapLayout (deterministic digital-twin layout)', () => {
  it('models the garden surface with area ≈ totalSurfaceArea', () => {
    const layout = computeGardenMapLayout(garden(20), []);
    expect(layout.width * layout.height).toBeCloseTo(20, 5);
    expect(layout.width).toBeGreaterThan(layout.height); // landscape surface
  });

  it('is deterministic: identical input produces identical output', () => {
    const plants = [plant(1, 4), plant(2, 2), plant(3, 6)];
    const a = computeGardenMapLayout(garden(20), plants);
    const b = computeGardenMapLayout(garden(20), plants);
    expect(a).toEqual(b);
  });

  it('is input-order independent — reopening a garden never rearranges it', () => {
    const plants = [plant(1, 4), plant(2, 2), plant(3, 6)];
    const shuffled = [plants[2], plants[0], plants[1]];
    expect(computeGardenMapLayout(garden(20), shuffled)).toEqual(
      computeGardenMapLayout(garden(20), plants),
    );
  });

  it('gives a bigger plant a proportionally bigger plot (the honesty rule)', () => {
    const layout = computeGardenMapLayout(garden(20), [plant(1, 2), plant(2, 5)]);
    const small = layout.plots.find((p) => p.plantId === 1)!;
    const big = layout.plots.find((p) => p.plantId === 2)!;
    expect((big.w * big.h) / (small.w * small.h)).toBeCloseTo(5 / 2, 5);
  });

  it('renders plot area at true scale when the garden has room (fitFactor 1)', () => {
    const layout = computeGardenMapLayout(garden(20), [plant(1, 4)]);
    const plot = layout.plots[0];
    expect(layout.fitFactor).toBe(1);
    expect(plot.w * plot.h).toBeCloseTo(4, 5);
    expect(plot.share).toBeCloseTo(0.2, 5);
  });

  it('keeps every plot inside the garden surface, even when nearly full', () => {
    const plants = [plant(1, 5), plant(2, 4), plant(3, 4), plant(4, 3), plant(5, 3.5)];
    const layout = computeGardenMapLayout(garden(20), plants); // 19.5/20 used
    expect(layout.plots).toHaveLength(5);
    for (const p of layout.plots) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(layout.width + 1e-6);
      expect(p.y + p.h).toBeLessThanOrEqual(layout.height + 1e-6);
    }
  });

  it('fills the surface exactly at true scale when exactly full (fitFactor 1)', () => {
    const plants = [plant(1, 5), plant(2, 5), plant(3, 5), plant(4, 5)];
    const layout = computeGardenMapLayout(garden(20), plants); // exactly full
    expect(layout.plots).toHaveLength(4);
    expect(layout.fitFactor).toBe(1);
    expect(layout.freeBand).toBeNull();
    const areas = layout.plots.map((p) => p.w * p.h);
    for (const area of areas) {
      expect(area).toBeCloseTo(5, 5); // every cell is exactly its real m²
    }
  });

  it('survives an over-capacity garden (shrunk after planting) without overflow', () => {
    const layout = computeGardenMapLayout(garden(10), [plant(1, 8), plant(2, 6)]);
    expect(layout.plots).toHaveLength(2);
    expect(layout.fitFactor).toBeLessThan(1); // uniform down-scale, ratios kept
    for (const p of layout.plots) {
      expect(p.x + p.w).toBeLessThanOrEqual(layout.width + 1e-6);
      expect(p.y + p.h).toBeLessThanOrEqual(layout.height + 1e-6);
    }
    expect(layout.freeBand).toBeNull();
  });

  it('sizes the free strip by the REAL free area: whole surface when empty, none when full', () => {
    const empty = computeGardenMapLayout(garden(20), []);
    expect(empty.freeBand).not.toBeNull();
    expect(empty.freeBand!.w * empty.freeBand!.h).toBeCloseTo(20, 5); // all free

    const half = computeGardenMapLayout(garden(20), [plant(1, 10)]);
    expect(half.freeBand!.w * half.freeBand!.h).toBeCloseTo(10, 5); // half free

    const sliver = computeGardenMapLayout(garden(20), [plant(1, 19.5)]);
    expect(sliver.freeBand!.w * sliver.freeBand!.h).toBeCloseTo(0.5, 5); // 0.5 m² sliver

    const full = computeGardenMapLayout(garden(6), [plant(1, 6)]);
    expect(full.freeBand).toBeNull();
  });

  it('ignores zero-area plants rather than emitting invisible plots', () => {
    const layout = computeGardenMapLayout(garden(20), [plant(1, 0), plant(2, 3)]);
    expect(layout.plots.map((p) => p.plantId)).toEqual([2]);
  });

  // ── Area honesty: visual AREA ratios equal real m² ratios, always ─────────
  const areaOf = (layout: ReturnType<typeof computeGardenMapLayout>, id: number) => {
    const p = layout.plots.find((plot) => plot.plantId === id)!;
    return p.w * p.h;
  };

  it.each([
    ['1 vs 4 m²', 1, 4],
    ['2 vs 8 m²', 2, 8],
    ['decimals: 0.5 vs 1.75 m²', 0.5, 1.75],
  ])('keeps exact visual-area proportionality — %s', (_label, a, b) => {
    const layout = computeGardenMapLayout(garden(20), [plant(1, a), plant(2, b)]);
    expect(areaOf(layout, 2) / areaOf(layout, 1)).toBeCloseTo(b / a, 6);
  });

  it('preserves area ratios in a near-full garden at true scale (no shrink needed)', () => {
    // 1 + 4 + 5 + 5 + 4.9 = 19.9 of 20 — the treemap partitions exactly,
    // so unlike the old shelf packing there is nothing to shrink.
    const plants = [plant(1, 1), plant(2, 4), plant(3, 5), plant(4, 5), plant(5, 4.9)];
    const layout = computeGardenMapLayout(garden(20), plants);
    expect(layout.fitFactor).toBe(1);
    expect(areaOf(layout, 2) / areaOf(layout, 1)).toBeCloseTo(4, 6);
    expect(areaOf(layout, 3) / areaOf(layout, 5)).toBeCloseTo(5 / 4.9, 6);
  });

  it('preserves area ratios in an exactly-full garden', () => {
    const layout = computeGardenMapLayout(garden(10), [plant(1, 2), plant(2, 8)]);
    expect(areaOf(layout, 2) / areaOf(layout, 1)).toBeCloseTo(4, 6);
  });

  // ── Occupancy honesty (refinement brief §3/§59): the DRAWN occupied
  // fraction of the surface equals usedArea / totalArea — what the HUD says
  // is what the eye sees. Exact by construction with the squarified treemap.
  const occupiedFraction = (layout: ReturnType<typeof computeGardenMapLayout>) =>
    layout.plots.reduce((sum, p) => sum + p.w * p.h, 0) / (layout.width * layout.height);

  it.each([
    ['98% garden LOOKS 98% full', 20, [5, 4, 4, 3, 3.5], 0.975],
    ['half-used garden looks half full', 20, [6, 4], 0.5],
    ['empty garden looks empty', 20, [], 0],
  ])('%s', (_label, total, areas, expected) => {
    const layout = computeGardenMapLayout(
      garden(total),
      areas.map((a, i) => plant(i + 1, a)),
    );
    expect(occupiedFraction(layout)).toBeCloseTo(expected, 5);
  });

  // ── Layout contract (ADR-007, treemap amendment): the layout is a pure,
  // deterministic function of the plant SET. Editing the set may rearrange
  // cells (the treemap re-partitions), but the same set always produces the
  // same picture — a slow revalidation can never shuffle the garden.
  it('re-partitions deterministically when the set changes', () => {
    const before = computeGardenMapLayout(garden(40), [plant(1, 6), plant(2, 4), plant(3, 2)]);
    const again = computeGardenMapLayout(garden(40), [plant(1, 6), plant(2, 4), plant(3, 2)]);
    expect(again).toEqual(before);
    expect(before.plots.map((p) => p.plantId)).toEqual([1, 2, 3]); // area desc, id asc
  });
});

describe('applyPositions / findOverlappingPlots (planner extensions)', () => {
  const base = () => computeGardenMapLayout(garden(40), [plant(1, 6), plant(2, 4), plant(3, 2)]);

  it('moves only the overridden plot and never changes footprint sizes', async () => {
    const { applyPositions } = await import('./garden-map-layout');
    const layout = base();
    const moved = applyPositions(layout, { 2: { x: 0.5, y: 0.5 } });
    const before = layout.plots.find((p) => p.plantId === 2)!;
    const after = moved.plots.find((p) => p.plantId === 2)!;
    expect(after.x).toBeCloseTo(0.5, 6);
    expect(after.y).toBeCloseTo(0.5, 6);
    expect(after.w).toBe(before.w); // honest area untouched
    expect(after.h).toBe(before.h);
    expect(moved.plots.find((p) => p.plantId === 1)).toEqual(
      layout.plots.find((p) => p.plantId === 1),
    );
  });

  it('clamps positions to the gutter inset so a plot never sits on the fence', async () => {
    const { applyPositions } = await import('./garden-map-layout');
    const layout = base();
    const inset = layout.width * 0.035; // mirrors GUTTER_RATIO — the auto-layout's own padding
    const moved = applyPositions(layout, { 1: { x: 999, y: -50 } });
    const plot = moved.plots.find((p) => p.plantId === 1)!;
    expect(plot.x + plot.w).toBeLessThanOrEqual(layout.width - inset + 1e-9);
    expect(plot.y).toBeCloseTo(inset, 9); // never flush at 0: shadow/outline/label stay on the lawn
  });

  it('snaps drop positions to tidy quarter-unit steps', async () => {
    const { snapPosition, PLANNER_SNAP } = await import('./garden-map-layout');
    expect(snapPosition({ x: 1.13, y: 2.61 })).toEqual({ x: 1.25, y: 2.5 });
    expect(snapPosition({ x: 0.1, y: 0.13 })).toEqual({ x: 0, y: 0.25 });
    const snapped = snapPosition({ x: 3.333, y: 4.444 });
    expect(snapped.x % PLANNER_SNAP).toBe(0);
    expect(snapped.y % PLANNER_SNAP).toBe(0);
  });

  it('detects footprint overlap symmetrically and reports no false positives', async () => {
    const { applyPositions, findOverlappingPlots } = await import('./garden-map-layout');
    const layout = base();
    expect(findOverlappingPlots(layout.plots).size).toBe(0); // auto-layout never overlaps
    const collided = applyPositions(layout, {
      2: { x: layout.plots[0].x + 0.1, y: layout.plots[0].y + 0.1 },
    });
    const overlaps = findOverlappingPlots(collided.plots);
    expect(overlaps.has(1)).toBe(true);
    expect(overlaps.has(2)).toBe(true);
    expect(overlaps.has(3)).toBe(false);
  });
});
