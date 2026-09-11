import { Garden, Plant } from '../../core/api/models';
import { occupancyRatio, usedSurfaceArea } from './garden-insights';
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

/** Total unplanted area: the free cells tile what the beds leave, exactly. */
const freeAreaOf = (layout: ReturnType<typeof computeGardenMapLayout>) =>
  layout.freeCells.reduce((sum, c) => sum + c.w * c.h, 0);

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w - 1e-9 &&
  b.x < a.x + a.w - 1e-9 &&
  a.y < b.y + b.h - 1e-9 &&
  b.y < a.y + a.h - 1e-9;

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

  it('sizes the free soil by the REAL free area: whole surface when empty, none when full', () => {
    const empty = computeGardenMapLayout(garden(20), []);
    expect(empty.freeBand).not.toBeNull();
    expect(empty.freeBand!.w * empty.freeBand!.h).toBeCloseTo(20, 5); // all free, one cell
    expect(freeAreaOf(empty)).toBeCloseTo(20, 5);

    const half = computeGardenMapLayout(garden(20), [plant(1, 10)]);
    expect(freeAreaOf(half)).toBeCloseTo(10, 5); // half free, in the block + outside it

    const sliver = computeGardenMapLayout(garden(20), [plant(1, 19.5)]);
    expect(sliver.freeCells).toHaveLength(1);
    expect(freeAreaOf(sliver)).toBeCloseTo(0.5, 5); // 0.5 m² sliver

    const full = computeGardenMapLayout(garden(6), [plant(1, 6)]);
    expect(full.freeBand).toBeNull();
    expect(full.freeCells).toEqual([]);
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

  // ── Occupancy honesty: the DRAWN occupied
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

  // ── Layout contract (ADR-007): the layout is a pure,
  // deterministic function of the plant SET. Editing the set may rearrange
  // cells (the treemap re-partitions), but the same set always produces the
  // same picture — a slow revalidation can never shuffle the garden.
  it('re-partitions deterministically when the set changes', () => {
    const before = computeGardenMapLayout(garden(40), [plant(1, 6), plant(2, 4), plant(3, 2)]);
    const again = computeGardenMapLayout(garden(40), [plant(1, 6), plant(2, 4), plant(3, 2)]);
    expect(again).toEqual(before);
    expect(before.plots.map((p) => p.plantId)).toEqual([1, 2, 3]); // area desc, id asc
  });

  // ── No slivers: the free soil is a treemap cell, so a small plant next to
  // large ones pairs with it instead of stretching along a whole column.
  it('draws a small plant beside large ones as a bed, not a sliver', () => {
    // The reported garden: 50 m² with 22 + 22 + 0.6 m². With the free soil as
    // a fixed strip the 0.6 m² fern drew as a ~4 m × 15 cm bar (aspect ~27).
    const layout = computeGardenMapLayout(garden(50), [plant(1, 22), plant(2, 22), plant(3, 0.6)]);
    const fern = layout.plots.find((p) => p.plantId === 3)!;
    expect(fern.w * fern.h).toBeCloseTo(0.6, 9); // still exactly its m²
    expect(Math.max(fern.w / fern.h, fern.h / fern.w)).toBeLessThan(4);
  });

  it('keeps room to grow toward the bottom-right, even when it is the largest cell', () => {
    // Squarify places the largest cell first (top-left). In a young garden
    // that is the free soil; unmirrored, both beds were shoved against the far
    // fence with nowhere to drag them.
    const layout = computeGardenMapLayout(garden(30), [plant(1, 5), plant(2, 2)]);
    const free = layout.freeBand!;
    expect(free.x + free.w).toBeCloseTo(layout.width, 9); // touches the right fence
    expect(free.x + free.w / 2).toBeGreaterThanOrEqual(layout.width / 2);
    expect(free.y + free.h / 2).toBeGreaterThanOrEqual(layout.height / 2 - 1e-9);
    // The beds share a block in the top-left corner (a young garden, 23% full)
    expect(Math.min(...layout.plots.map((p) => p.x))).toBeCloseTo(0, 9);
    expect(Math.min(...layout.plots.map((p) => p.y))).toBeCloseTo(0, 9);
    for (const p of layout.plots) {
      expect(p.w * p.h).toBeCloseTo(p.requiredArea, 9); // mirroring never changes area
    }
  });

  it('mirrors vertically too when the free cell lands in the top half', () => {
    // 20 m²: Tomato 8 + Basil 4 + Thyme 2 packs the 6 m² free cell top-right.
    const layout = computeGardenMapLayout(garden(20), [plant(1, 8), plant(2, 4), plant(3, 2)]);
    const free = layout.freeBand!;
    expect(free.y + free.h).toBeCloseTo(layout.height, 9); // touches the bottom fence
    expect(free.x + free.w).toBeCloseTo(layout.width, 9);
  });

  it('places the free cell inside the surface without overlapping any bed', () => {
    const layout = computeGardenMapLayout(garden(50), [plant(1, 22), plant(2, 22), plant(3, 0.6)]);
    const free = layout.freeBand!;
    expect(free.x).toBeGreaterThanOrEqual(-1e-9);
    expect(free.y).toBeGreaterThanOrEqual(-1e-9);
    expect(free.x + free.w).toBeLessThanOrEqual(layout.width + 1e-9);
    expect(free.y + free.h).toBeLessThanOrEqual(layout.height + 1e-9);
    for (const p of layout.plots) {
      const apart =
        p.x + p.w <= free.x + 1e-9 ||
        free.x + free.w <= p.x + 1e-9 ||
        p.y + p.h <= free.y + 1e-9 ||
        free.y + free.h <= p.y + 1e-9;
      expect(apart).toBe(true);
    }
  });

  it('draws a young garden as near-square beds in the corner, never full-height slivers', () => {
    // 25 m² with 2 + 0.3 m² once drew both beds as one
    // 0.58 m × 3.95 m column beside a single, huge free cell.
    const layout = computeGardenMapLayout(garden(25), [plant(1, 2), plant(2, 0.3)]);
    for (const p of layout.plots) {
      expect(p.w * p.h).toBeCloseTo(p.requiredArea, 9); // still exactly its m²
      expect(Math.max(p.w / p.h, p.h / p.w)).toBeLessThan(2.5);
      expect(p.h).toBeLessThan(layout.height * 0.6); // not a fence-to-fence bar
    }
    // Beds and free cells still tile the surface exactly, with no overlaps.
    const cells: Box[] = [...layout.plots, ...layout.freeCells];
    expect(cells.reduce((sum, c) => sum + c.w * c.h, 0)).toBeCloseTo(25, 9);
    cells.forEach((a, i) => cells.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
    // The largest open ground is labelled "room to grow"
    expect(layout.freeBand!.w * layout.freeBand!.h).toBe(
      Math.max(...layout.freeCells.map((c) => c.w * c.h)),
    );
  });

  it('keeps the whole-surface treemap once a garden is 70% full', () => {
    // 14 of 20 m²: exactly the block threshold — one free cell, beds fill the rest
    const layout = computeGardenMapLayout(garden(20), [plant(1, 8), plant(2, 4), plant(3, 2)]);
    expect(layout.freeCells).toHaveLength(1);
    expect(freeAreaOf(layout)).toBeCloseTo(6, 9);
  });
});

/**
 * Guard: the map must never compute capacity independently.
 *
 * The drawn "used" region is the part of the surface not covered by the free
 * band. If the layout re-derives used area itself, these ratios drift from
 * `garden-insights` — the single authority the HUD, the forms and the server's
 * overcrowding rule all share.
 */
describe('capacity single source of truth', () => {
  const cases: ReadonlyArray<{ label: string; total: number; areas: readonly number[] }> = [
    { label: '0% — empty garden', total: 20, areas: [] },
    { label: '50% — half planted', total: 20, areas: [6, 4] },
    { label: '97.5% — almost full', total: 20, areas: [10, 5, 4.5] },
    { label: '100% — exact fit', total: 20, areas: [12, 8] },
    { label: 'decimal areas', total: 13.7, areas: [1.1, 2.35, 0.05, 4.9] },
    { label: 'over capacity (fitFactor < 1)', total: 10, areas: [8, 7] },
  ];

  for (const { label, total, areas } of cases) {
    it(`agrees with garden-insights: ${label}`, () => {
      const g = garden(total);
      const plants = areas.map((area, i) => plant(i + 1, area));
      const layout = computeGardenMapLayout(g, plants);

      const drawnOccupancy = 1 - freeAreaOf(layout) / (layout.width * layout.height);
      // Over-capacity gardens clamp at 100% drawn; the domain ratio may exceed 1.
      const expected = Math.min(1, occupancyRatio(g, plants));

      expect(drawnOccupancy).toBeCloseTo(expected, 9);
      expect(layout.plots.reduce((sum, p) => sum + p.requiredArea, 0)).toBeCloseTo(
        usedSurfaceArea(plants),
        9,
      );
    });
  }

  it('excludes a plant from its own capacity on edit, exactly as the domain does', () => {
    const g = garden(20);
    // Editing plant 1 from 12 m² to 15 m²: the domain excludes the plant's own
    // area from the check, so 15 + 5 = 20 fits exactly. The map must redraw to
    // the same 100%, not to some independently derived number.
    const afterEdit = [plant(1, 15), plant(2, 5)];
    const layout = computeGardenMapLayout(g, afterEdit);
    const drawnOccupancy = 1 - freeAreaOf(layout) / 20;

    expect(usedSurfaceArea(afterEdit)).toBe(20);
    expect(drawnOccupancy).toBeCloseTo(occupancyRatio(g, afterEdit), 9);
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

  it('clamps positions inside the garden: a bed may touch the fence, never cross it', async () => {
    const { applyPositions } = await import('./garden-map-layout');
    const layout = base();
    for (const pos of [
      { x: 999, y: -50 },
      { x: -50, y: 999 },
      { x: 999, y: 999 },
    ]) {
      const plot = applyPositions(layout, { 1: pos }).plots.find((p) => p.plantId === 1)!;
      expect(plot.x).toBeGreaterThanOrEqual(0);
      expect(plot.y).toBeGreaterThanOrEqual(0);
      expect(plot.x + plot.w).toBeLessThanOrEqual(layout.width + 1e-9);
      expect(plot.y + plot.h).toBeLessThanOrEqual(layout.height + 1e-9);
    }
  });

  it('never moves an untouched bed: its own position is already legal (first-drag jump)', async () => {
    // Regression: the clamp used an inner gutter the auto-layout never packs
    // with, so the first drag of a full-height bed shoved it past the fence.
    const { applyPositions } = await import('./garden-map-layout');
    const layout = computeGardenMapLayout(garden(50), [plant(1, 22), plant(2, 22), plant(3, 0.6)]);
    for (const plot of layout.plots) {
      const applied = applyPositions(layout, { [plot.plantId]: { x: plot.x, y: plot.y } });
      const after = applied.plots.find((p) => p.plantId === plot.plantId)!;
      // The old gutter moved beds by ~0.31 m; float noise at the far edge is ~1e-15.
      expect(after.x).toBeCloseTo(plot.x, 9);
      expect(after.y).toBeCloseTo(plot.y, 9);
      expect(after.w).toBe(plot.w);
      expect(after.h).toBe(plot.h);
    }
  });

  it('settles a drop against a neighbouring bed edge within the threshold', async () => {
    const { settleDrop } = await import('./garden-map-layout');
    const layout = base();
    const [a, b] = layout.plots;
    // Drop plot b so its left edge lands 0.08 short of plot a's right edge.
    const settled = settleDrop(layout, b.plantId, { x: a.x + a.w - 0.08, y: b.y }, 0.2);
    expect(settled.x).toBeCloseTo(Math.min(a.x + a.w, layout.width - b.w), 9);
  });

  it('settles to the grid when no edge is within reach, and stays inside the garden', async () => {
    const { settleDrop, PLANNER_SNAP } = await import('./garden-map-layout');
    const layout = computeGardenMapLayout(garden(200), [plant(1, 4)]);
    const [p] = layout.plots;
    const mid = settleDrop(layout, p.plantId, { x: 3.13, y: 2.61 }, 0.01);
    expect(mid.x % PLANNER_SNAP).toBeCloseTo(0, 9);
    expect(mid.y % PLANNER_SNAP).toBeCloseTo(0, 9);

    const flung = settleDrop(layout, p.plantId, { x: 999, y: 999 }, 0.01);
    expect(flung.x).toBeCloseTo(layout.width - p.w, 9);
    expect(flung.y).toBeCloseTo(layout.height - p.h, 9);
  });

  it('snaps to the grid for a plant it no longer knows', async () => {
    const { settleDrop } = await import('./garden-map-layout');
    expect(settleDrop(base(), 99, { x: 1.13, y: 2.61 }, 0.2)).toMatchObject({ x: 1.25, y: 2.5 });
  });

  it('beds that merely touch are not reported as overlapping', async () => {
    const { applyPositions, findOverlappingPlots } = await import('./garden-map-layout');
    const layout = base();
    const [a, b] = layout.plots;
    const touching = applyPositions(layout, { [b.plantId]: { x: a.x + a.w, y: a.y } });
    const moved = touching.plots.find((p) => p.plantId === b.plantId)!;
    // Only meaningful if the clamp let it sit flush against a.
    if (Math.abs(moved.x - (a.x + a.w)) < 1e-9) {
      expect(findOverlappingPlots(touching.plots).has(b.plantId)).toBe(false);
    }
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

describe('computeGardenMapLayout — degenerate surfaces', () => {
  it('gives every plot a defined box even when the used region collapses', () => {
    // A garden with (effectively) no surface leaves squarify nothing to divide,
    // so each plot falls back to a zero box rather than `undefined` reaching
    // the SVG as NaN.
    const layout = computeGardenMapLayout(garden(0), [plant(1, 5), plant(2, 3)]);

    for (const plot of layout.plots) {
      expect(Number.isFinite(plot.x)).toBe(true);
      expect(Number.isFinite(plot.y)).toBe(true);
      expect(Number.isFinite(plot.w)).toBe(true);
      expect(Number.isFinite(plot.h)).toBe(true);
    }
  });

  it('drops zero-area plants rather than drawing an invisible bed', () => {
    const layout = computeGardenMapLayout(garden(20), [plant(1, 0), plant(2, 5)]);
    expect(layout.plots.map((p) => p.plantId)).toEqual([2]);
  });
});
