import { Garden, Plant } from '../../core/api/models';
import { usedSurfaceArea } from './garden-insights';

/**
 * Pure, deterministic layout for the Garden Map (ADR-007).
 *
 * Coordinate system: "map units", where 1 unit² == 1 m² at fitFactor 1. The
 * garden is a rounded rectangle of GOLDEN-ish aspect whose area equals
 * `totalSurfaceArea`; each plant becomes a treemap cell whose area equals its
 * `surfaceAreaRequired` exactly (× fitFactor² only for over-capacity gardens).
 * The free region is an explicit strip sized by the real free area, so the
 * map's fullness always matches the HUD — the honesty rule of the map.
 *
 * Determinism: plants are sorted by area desc, then plantId asc, and each
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
   * uniformly so gutters + plots fit the surface (relative areas preserved).
   */
  readonly fitFactor: number;
  /** Contiguous unplanted region below the packed plots, if visually useful. */
  readonly freeBand: FreeBand | null;
}

/** Garden surface aspect ratio (w/h). Wide enough for cards, close to golden. */
const SURFACE_ASPECT = 1.6;
/** Inner padding used by the planner's drag clamp, as a fraction of width. */
const GUTTER_RATIO = 0.035;

/**
 * AREA-HONEST layout (refinement brief §1–4): the garden surface is a
 * fixed-size world whose area equals `totalSurfaceArea`, the free region is a
 * strip whose width is exactly `freeArea / height`, and the plants partition
 * the remaining "used" region via a SQUARIFIED TREEMAP (Bruls et al.) — every
 * cell's area equals the plant's real `surfaceAreaRequired`, exactly. A 98%
 * garden therefore LOOKS 98% full; the earlier shelf packing with gutters and
 * shrink-to-fit could render it two-thirds empty, which contradicted the HUD.
 *
 * Over-capacity gardens (total shrunk after planting) scale all cells
 * uniformly by totalArea / usedArea — recorded as `fitFactor` < 1; ratios are
 * preserved and nothing overflows. Deterministic: plants sort by area desc,
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
  const drawnUsed = Math.min(usedArea, totalArea);

  // The free region is an explicit right-hand strip: its width IS the free
  // share of the surface, so 0.5 m² free reads as a sliver, 50% as half.
  const freeW = width * (1 - drawnUsed / totalArea);
  const usedRect: Rect = { x: 0, y: 0, w: width - freeW, h: height };

  const cells =
    ordered.length > 0 && usedRect.w > 1e-9
      ? squarify(
          ordered.map((p) => p.surfaceAreaRequired * fitFactor * fitFactor),
          usedRect,
        )
      : [];

  const plots: PlantPlot[] = ordered.map((plant, i) => ({
    plantId: plant.plantId,
    label: plant.plantName,
    plantType: plant.plantType,
    requiredArea: plant.surfaceAreaRequired,
    share: plant.surfaceAreaRequired / totalArea,
    x: cells[i]?.x ?? 0,
    y: cells[i]?.y ?? 0,
    w: cells[i]?.w ?? 0,
    h: cells[i]?.h ?? 0,
  }));

  const freeBand: FreeBand | null =
    freeW > 1e-6 ? { x: width - freeW, y: 0, w: freeW, h: height } : null;

  return { width, height, plots, fitFactor, freeBand };
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
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
 * Apply locally-persisted visual positions to plots (feature brief §15–17).
 * Position is PRESENTATION ONLY — footprint size (the honest area) is
 * untouched; each plot's center is clamped so it can never leave the garden.
 */
export function applyPositions(
  layout: GardenMapLayout,
  positions: Readonly<Record<number, PositionOverride>>,
): GardenMapLayout {
  if (Object.keys(positions).length === 0) {
    return layout;
  }
  // Beds are clamped to the same inner gutter the auto-layout packs with, so
  // a dropped bed never sits flush on the fence or pokes past the surface's
  // rounded corner (its shadow, selection outline and label stay on the lawn).
  const inset = layout.width * GUTTER_RATIO;
  const plots = layout.plots.map((p) => {
    const pos = positions[p.plantId];
    if (!pos) {
      return p;
    }
    const x = Math.min(Math.max(pos.x, inset), Math.max(inset, layout.width - p.w - inset));
    const y = Math.min(Math.max(pos.y, inset), Math.max(inset, layout.height - p.h - inset));
    return { ...p, x, y };
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
 * AABB overlap detection between plot footprints. Overlap is a VISUAL
 * arrangement concern, never a capacity verdict — the business rule stays
 * Σ surfaceAreaRequired ≤ totalSurfaceArea regardless of where beds sit
 * (documented in INTERACTIVE-GARDEN-UX.md). Returns the ids involved in at
 * least one overlap.
 */
export function findOverlappingPlots(plots: readonly PlantPlot[]): ReadonlySet<number> {
  const overlapping = new Set<number>();
  for (let i = 0; i < plots.length; i++) {
    for (let j = i + 1; j < plots.length; j++) {
      const a = plots[i];
      const b = plots[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        overlapping.add(a.plantId);
        overlapping.add(b.plantId);
      }
    }
  }
  return overlapping;
}
