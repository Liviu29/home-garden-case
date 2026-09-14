import type { Garden, Plant } from '../../core/api/models';
import { usedSurfaceArea } from '../garden-insights/garden-insights';

/**
 * Pure, deterministic layout for the Garden Map (ADR-007).
 *
 * Coordinate system: "map units", where 1 unit² == 1 m² at fitFactor 1. The
 * garden is a rounded rectangle of GOLDEN-ish aspect whose area equals
 * `totalSurfaceArea`; each plant becomes a treemap cell whose area equals its
 * `surfaceAreaRequired` exactly (× fitFactor² only for over-capacity gardens).
 * The free soil is a treemap cell too, sized by the real free area, so the
 * map's fullness always matches the HUD — the honesty rule of the map.
 *
 * Determinism: cells are sorted by area desc, then plantId asc, and each
 * plot's aspect ratio is seeded from its plantId. No randomness — reopening a
 * garden never rearranges it, and input order does not matter.
 */

interface PlantPlot {
  readonly plantId: number;
  readonly label: string;
  readonly plantType: Plant['plantType'];
  readonly requiredArea: number;
  /** Fraction of the garden's total surface this plant uses (0..1). */
  readonly share: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface FreeBand {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface GardenMapLayout {
  /** Garden surface size in map units (width × height ≈ totalSurfaceArea). */
  readonly width: number;
  readonly height: number;
  readonly plots: readonly PlantPlot[];
  /**
   * 1 when plots render at true scale; < 1 when everything was shrunk
   * uniformly so the plots fit the surface (relative areas preserved).
   */
  readonly fitFactor: number;
  /**
   * Every unplanted cell. With the plots they tile the surface exactly, so
   * their areas always sum to the real free area.
   */
  readonly freeCells: readonly FreeBand[];
  /** The largest unplanted cell — the main "room to grow" — if any. */
  readonly freeBand: FreeBand | null;
}

/** Garden surface aspect ratio (w/h). Wide enough for cards, close to golden. */
const SURFACE_ASPECT = 1.6;
/**
 * Below this fill a young garden's beds share a near-square block in the
 * corner (beds + 30% slack) instead of partitioning the whole surface.
 */
const BLOCK_DENSITY = 0.7;
/** Sentinel id for the free-soil cell inside the treemap (plant ids are ≥ 1). */
const FREE_CELL = -1;
/** Touching beds share an edge; float noise must not report that as overlap. */
const OVERLAP_EPSILON = 1e-6;

/**
 * AREA-HONEST layout: the garden surface is a
 * fixed-size world whose area equals `totalSurfaceArea`, and a SQUARIFIED
 * TREEMAP (Bruls et al.) partitions it into one cell per plant plus one cell
 * for the free soil — every cell's area equals the real m², exactly. A 98%
 * garden therefore LOOKS 98% full.
 *
 * The free soil takes part in the treemap instead of being a fixed strip:
 * a strip forced every bed into the remaining column, so a small plant next
 * to large ones could only become a sliver (a 0.6 m² fern drew as a 4 m × 15 cm
 * bar). As a cell of its own, the free soil pairs up with the small plants
 * and every bed stays close to square.
 *
 * Over-capacity gardens (total shrunk after planting) scale all cells
 * uniformly by totalArea / usedArea — recorded as `fitFactor` < 1; ratios are
 * preserved and nothing overflows. Deterministic: cells sort by area desc,
 * then plantId asc, and squarify is a pure fold over that order.
 */
export function computeGardenMapLayout(garden: Garden, plants: readonly Plant[]): GardenMapLayout {
  const totalArea = Math.max(garden.totalSurfaceArea, 0.0001);
  const width = Math.sqrt(totalArea * SURFACE_ASPECT);
  const height = totalArea / width;

  const ordered = [...plants]
    .filter((p) => p.surfaceAreaRequired > 0)
    .sort((a, b) => b.surfaceAreaRequired - a.surfaceAreaRequired || a.plantId - b.plantId);

  // Single source of truth: the map's fullness is the SAME number the HUD,
  // the forms and the server's overcrowding rule use. The map may scale it
  // (fitFactor) but must never compute it independently.
  const usedArea = usedSurfaceArea(ordered);
  const fitFactor = usedArea > totalArea ? Math.sqrt(totalArea / usedArea) : 1;
  const freeArea = totalArea - Math.min(usedArea, totalArea);

  const cellsIn: Cell[] = ordered.map((p) => ({
    id: p.plantId,
    area: p.surfaceAreaRequired * fitFactor * fitFactor,
  }));
  const plantedArea = totalArea - freeArea;

  // A young garden: one big free cell left the beds only the thin strip beside
  // it (a 1 m² bed in a 25 m² garden drew as a 20 cm × 4 m bar). So the beds
  // get a near-square block of their own in the top-left corner — the beds
  // plus 30% slack, which pairs with the small beds exactly as the free cell
  // does in a full garden — and the rest of the surface stays open to the
  // right and below. Every cell is still its exact m², and the cells still
  // tile the surface.
  const blockArea = plantedArea / BLOCK_DENSITY;
  let block: Rect = { x: 0, y: 0, w: width, h: height };
  const outer: Rect[] = [];
  if (cellsIn.length > 0 && blockArea < totalArea * (1 - 1e-9)) {
    const h = Math.min(height, Math.sqrt(blockArea));
    const w = Math.min(width, blockArea / h);
    block = { x: 0, y: 0, w, h };
    outer.push({ x: w, y: 0, w: width - w, h: height }, { x: 0, y: h, w, h: height - h });
  }

  const blockFree = block.w * block.h - plantedArea;
  if (blockFree > totalArea * 1e-7) {
    cellsIn.push({ id: FREE_CELL, area: blockFree });
  }
  // Equal areas: plants before the free soil, then by id — fully deterministic.
  cellsIn.sort(
    (a, b) =>
      b.area - a.area || Number(a.id === FREE_CELL) - Number(b.id === FREE_CELL) || a.id - b.id,
  );
  const cellById = packCells(cellsIn, block);

  const plots: PlantPlot[] = ordered.map((plant) => {
    const cell = cellById.get(plant.plantId);
    return {
      plantId: plant.plantId,
      label: plant.plantName,
      plantType: plant.plantType,
      requiredArea: plant.surfaceAreaRequired,
      share: plant.surfaceAreaRequired / totalArea,
      x: cell?.x ?? 0,
      y: cell?.y ?? 0,
      w: cell?.w ?? 0,
      h: cell?.h ?? 0,
    };
  });

  const minArea = totalArea * 1e-7;
  const slack = cellById.get(FREE_CELL);
  const freeCells = [...(slack ? [slack] : []), ...outer].filter((c) => c.w * c.h > minArea);
  const freeBand = freeCells.reduce<FreeBand | null>(
    (best, c) => (!best || c.w * c.h > best.w * best.h ? c : best),
    null,
  );

  return { width, height, plots, fitFactor, freeCells, freeBand };
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Cell {
  readonly id: number;
  readonly area: number;
}

/**
 * Squarify `cells` into `rect`, then mirror the result so the free cell (if
 * any) sits toward the rect's bottom-right. Squarify lays the LARGEST cell
 * first, top-left — often the free soil, which would push every bed against
 * the far fence. Mirroring keeps each cell's area and neighbours exactly:
 * beds start top-left, room to grow sits where the eye ends, next to the open
 * ground outside the block. Deterministic — a pure function of the set.
 */
function packCells(cells: readonly Cell[], rect: Rect): Map<number, Rect> {
  const packed =
    cells.length > 0
      ? squarify(
          cells.map((c) => c.area),
          rect,
        )
      : [];
  const free = packed[cells.findIndex((c) => c.id === FREE_CELL)];
  const flipX = !!free && free.x + free.w / 2 < rect.x + rect.w / 2;
  const flipY = !!free && free.y + free.h / 2 < rect.y + rect.h / 2;
  return new Map(
    cells.map((c, i) => {
      const r = packed[i];
      return [
        c.id,
        {
          ...r,
          x: flipX ? 2 * rect.x + rect.w - r.x - r.w : r.x,
          y: flipY ? 2 * rect.y + rect.h - r.y - r.h : r.y,
        },
      ];
    }),
  );
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk 2000): partitions `rect` into
 * cells whose areas equal `areas`, keeping aspect ratios close to square.
 * Rows are laid along the shorter side; a row is closed as soon as adding the
 * next item would worsen the row's worst aspect ratio. Pure and total: the
 * output covers the rect exactly (areas must sum to the rect's area).
 */
function squarify(areas: readonly number[], rect: Rect): Rect[] {
  const out: Rect[] = new Array<Rect>(areas.length);
  let r = { ...rect };
  let i = 0;
  while (i < areas.length) {
    const vertical = r.w >= r.h; // row becomes a vertical column strip
    const side = Math.max(vertical ? r.h : r.w, 1e-9);

    let count = 1;
    let rowSum = areas[i];
    let worst = worstAspect(areas, i, count, rowSum, side);
    while (i + count < areas.length) {
      const nextSum = rowSum + areas[i + count];
      const nextWorst = worstAspect(areas, i, count + 1, nextSum, side);
      if (nextWorst > worst) {
        break;
      }
      count += 1;
      rowSum = nextSum;
      worst = nextWorst;
    }

    const thickness = rowSum / side;
    let offset = 0;
    for (let k = 0; k < count; k++) {
      const len = areas[i + k] / thickness;
      out[i + k] = vertical
        ? { x: r.x, y: r.y + offset, w: thickness, h: len }
        : { x: r.x + offset, y: r.y, w: len, h: thickness };
      offset += len;
    }
    r = vertical
      ? { x: r.x + thickness, y: r.y, w: r.w - thickness, h: r.h }
      : { x: r.x, y: r.y + thickness, w: r.w, h: r.h - thickness };
    i += count;
  }
  return out;
}

/** Worst (max) aspect ratio a row would have at the given thickness. */
function worstAspect(
  areas: readonly number[],
  start: number,
  count: number,
  rowSum: number,
  side: number,
): number {
  const thickness = rowSum / side;
  let worst = 0;
  for (let k = 0; k < count; k++) {
    const len = areas[start + k] / thickness;
    worst = Math.max(worst, len / thickness, thickness / len);
  }
  return worst;
}

// ── Planner extensions (pure) ────────────────────────────────────────────────

interface PositionOverride {
  readonly x: number;
  readonly y: number;
}

/**
 * Keep a bed's top-left corner inside the garden: a bed may touch the fence,
 * never cross it. The bounds are the same surface the auto-layout packs into,
 * so an untouched bed is already legal and the first drag cannot make it jump.
 * (An earlier version clamped to an inner gutter the auto-layout never used —
 * a full-height bed then poked out of the bottom the moment it was dragged.)
 */
export function clampPosition(
  surface: { readonly width: number; readonly height: number },
  size: { readonly w: number; readonly h: number },
  pos: PositionOverride,
): PositionOverride {
  return {
    x: Math.min(Math.max(pos.x, 0), Math.max(0, surface.width - size.w)),
    y: Math.min(Math.max(pos.y, 0), Math.max(0, surface.height - size.h)),
  };
}

/**
 * Apply locally-persisted visual positions to plots.
 * Position is PRESENTATION ONLY — footprint size (the honest area) is
 * untouched; each plot is clamped so it can never leave the garden, which
 * also self-heals positions saved before the garden was resized.
 */
export function applyPositions(
  layout: GardenMapLayout,
  positions: Readonly<Record<number, PositionOverride>>,
): GardenMapLayout {
  if (Object.keys(positions).length === 0) {
    return layout;
  }
  const plots = layout.plots.map((p) => {
    const pos = positions[p.plantId];
    return pos ? { ...p, ...clampPosition(layout, p, pos) } : p;
  });
  return { ...layout, plots };
}

/**
 * Snap a dropped position to a tidy fraction of a map unit (1 unit = 1 m
 * side), so arrangements align with the m² grid layer instead of landing on
 * arbitrary fractions. Pure; clamping still happens in applyPositions.
 */
export const PLANNER_SNAP = 0.25;

export function snapPosition(pos: PositionOverride): PositionOverride {
  return {
    x: Math.round(pos.x / PLANNER_SNAP) * PLANNER_SNAP,
    y: Math.round(pos.y / PLANNER_SNAP) * PLANNER_SNAP,
  };
}

/**
 * A smart guide: the line along which the dropped bed's edge lines up with a
 * neighbouring bed's edge. `axis: 'x'` is a vertical line at x = `at`, drawn
 * from `from` to `to` along y (and vice versa) — spanning both beds.
 */
interface AlignmentGuide {
  readonly axis: 'x' | 'y';
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

interface DropSettlement extends PositionOverride {
  /** Guides for the edges that magnetised to a neighbouring bed. */
  readonly guides: readonly AlignmentGuide[];
  /** The bed returned to its automatic spot (the home magnet won). */
  readonly home: boolean;
}

/** An edge a dropped bed can magnetise to; fence edges draw no guide. */
interface SnapTarget {
  readonly edge: number;
  readonly from: number;
  readonly to: number;
  readonly fence: boolean;
}

/**
 * Where a dropped bed settles:
 * 1. within `threshold` of its HOME (its spot in the automatic arrangement)
 *    on both axes, it returns there exactly — so a bed can always be put back
 *    where it started, pixel-perfect;
 * 2. otherwise, per axis, its edges magnetise to the fence and to the other
 *    beds' edges (beds butt up cleanly instead of leaving hairline gaps or
 *    overlaps) and each bed-edge alignment reports a smart guide;
 * 3. otherwise it snaps to the PLANNER_SNAP grid.
 * The result is always inside the garden.
 */
export function settleDrop(
  layout: GardenMapLayout,
  plantId: number,
  pos: PositionOverride,
  threshold: number,
  home: PositionOverride | null = null,
): DropSettlement {
  const plot = layout.plots.find((p) => p.plantId === plantId);
  if (!plot) {
    return { ...snapPosition(pos), guides: [], home: false };
  }
  if (home && Math.abs(pos.x - home.x) <= threshold && Math.abs(pos.y - home.y) <= threshold) {
    return { ...clampPosition(layout, plot, home), guides: [], home: true };
  }
  const others = layout.plots.filter((p) => p.plantId !== plantId);
  const fenceX: SnapTarget[] = [0, layout.width].map((edge) => ({
    edge,
    from: 0,
    to: layout.height,
    fence: true,
  }));
  const fenceY: SnapTarget[] = [0, layout.height].map((edge) => ({
    edge,
    from: 0,
    to: layout.width,
    fence: true,
  }));
  const sx = settleAxis(
    pos.x,
    plot.w,
    [
      ...fenceX,
      ...others.flatMap((o) =>
        [o.x, o.x + o.w].map((edge) => ({ edge, from: o.y, to: o.y + o.h, fence: false })),
      ),
    ],
    threshold,
  );
  const sy = settleAxis(
    pos.y,
    plot.h,
    [
      ...fenceY,
      ...others.flatMap((o) =>
        [o.y, o.y + o.h].map((edge) => ({ edge, from: o.x, to: o.x + o.w, fence: false })),
      ),
    ],
    threshold,
  );
  const at = clampPosition(layout, plot, { x: sx.value, y: sy.value });
  const guides: AlignmentGuide[] = [];
  // A guide is only true if the clamp kept the aligned value.
  if (sx.target && !sx.target.fence && Math.abs(at.x - sx.value) < 1e-9) {
    guides.push({
      axis: 'x',
      at: sx.target.edge,
      from: Math.min(sx.target.from, at.y),
      to: Math.max(sx.target.to, at.y + plot.h),
    });
  }
  if (sy.target && !sy.target.fence && Math.abs(at.y - sy.value) < 1e-9) {
    guides.push({
      axis: 'y',
      at: sy.target.edge,
      from: Math.min(sy.target.from, at.x),
      to: Math.max(sy.target.to, at.x + plot.w),
    });
  }
  return { ...at, guides, home: false };
}

/** One axis of `settleDrop`: nearest edge alignment wins, else the grid. */
function settleAxis(
  value: number,
  size: number,
  targets: readonly SnapTarget[],
  threshold: number,
): { value: number; target: SnapTarget | null } {
  let best = Math.round(value / PLANNER_SNAP) * PLANNER_SNAP;
  let bestTarget: SnapTarget | null = null;
  let bestDistance = threshold;
  for (const target of targets) {
    // The bed's leading edge on the target, or its trailing edge on it.
    for (const candidate of [target.edge, target.edge - size]) {
      const distance = Math.abs(candidate - value);
      if (distance <= bestDistance) {
        best = candidate;
        bestTarget = target;
        bestDistance = distance;
      }
    }
  }
  return { value: best, target: bestTarget };
}

/**
 * AABB overlap detection between plot footprints. Overlap is a VISUAL
 * arrangement concern, never a capacity verdict — the business rule stays
 * Σ surfaceAreaRequired ≤ totalSurfaceArea regardless of where beds sit
 * (documented in INTERACTIVE-GARDEN-UX.md). Beds that merely touch do not
 * overlap. Returns the ids involved in at least one overlap.
 */
export function findOverlappingPlots(plots: readonly PlantPlot[]): ReadonlySet<number> {
  const overlapping = new Set<number>();
  const e = OVERLAP_EPSILON;
  for (let i = 0; i < plots.length; i++) {
    for (let j = i + 1; j < plots.length; j++) {
      const a = plots[i];
      const b = plots[j];
      if (
        a.x < b.x + b.w - e &&
        b.x < a.x + a.w - e &&
        a.y < b.y + b.h - e &&
        b.y < a.y + a.h - e
      ) {
        overlapping.add(a.plantId);
        overlapping.add(b.plantId);
      }
    }
  }
  return overlapping;
}
