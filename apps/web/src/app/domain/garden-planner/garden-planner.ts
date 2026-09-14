import type { Plant } from '../../core/api/models';

/**
 * Pure planner intelligence for the Garden Map (ADR-007 §planner).
 *
 * Everything here is derived from real data — footprint boxes from
 * garden-map-layout, ideal humidity and plantation dates from the API — and is
 * PRESENTATION or ADVICE only: capacity stays Σ surfaceAreaRequired, and no
 * function here invents a measurement (no sensors, no sunlight, no soil data).
 * All functions are deterministic, so the plan never shuffles between visits.
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface PlotBox extends Box {
  readonly plantId: number;
}

interface Surface {
  readonly width: number;
  readonly height: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Touching beds share an edge; float noise must never read as overlap. */
const EPS = 1e-9;

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;

// ── Free soil ────────────────────────────────────────────────────────────────

/**
 * The largest empty axis-aligned rectangle on the surface — where the
 * "Available" annotation belongs once beds have been moved. In the automatic
 * arrangement the free soil is a single treemap cell, so this returns exactly
 * that cell; after a drag it follows the real open ground instead of pointing
 * at the spot a bed now covers.
 *
 * A maximal empty rectangle's left/right sides lie on the fence or on a bed
 * edge, so those are the only x-spans worth testing; for each span, the
 * tallest vertical gap between the beds that cross it is exact. O(n² · n log n)
 * for n beds — trivial at garden scale.
 */
export function largestFreeRect(surface: Surface, plots: readonly Box[]): Box | null {
  const { width, height } = surface;
  if (!(width > 0) || !(height > 0)) {
    return null;
  }
  const solid = plots.filter((p) => p.w > 0 && p.h > 0);
  const xs = [
    ...new Set(
      [0, width, ...solid.flatMap((p) => [p.x, p.x + p.w])].map((v) => clamp(v, 0, width)),
    ),
  ].sort((a, b) => a - b);

  let best: Box | null = null;
  let bestArea = width * height * 1e-6; // ignore slivers
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const x1 = xs[i];
      const x2 = xs[j];
      const blocked = solid
        .filter((p) => p.x < x2 - EPS && p.x + p.w > x1 + EPS)
        .map((p) => [clamp(p.y, 0, height), clamp(p.y + p.h, 0, height)] as const)
        .sort((a, b) => a[0] - b[0]);
      let cursor = 0;
      const consider = (y1: number, y2: number): void => {
        const area = (x2 - x1) * (y2 - y1);
        if (area > bestArea + EPS) {
          bestArea = area;
          best = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
        }
      };
      for (const [top, bottom] of blocked) {
        if (top > cursor + EPS) {
          consider(cursor, top);
        }
        cursor = Math.max(cursor, bottom);
      }
      if (height > cursor + EPS) {
        consider(cursor, height);
      }
    }
  }
  return best;
}

// ── Watering zones ───────────────────────────────────────────────────────────

export type WateringZone = 'dry' | 'balanced' | 'humid';

/**
 * Three bands around the garden form's own presets (Dry 40 % · Balanced 60 %
 * · Humid 80 %): a plant belongs to the preset it is closest to. A reading of
 * the plant's configured PREFERENCE — never a moisture measurement. The
 * zones' names live with the UI (`shared/ui/watering-zone`); this is their
 * order, driest first.
 */
export const WATERING_ZONE_ORDER: readonly WateringZone[] = ['dry', 'balanced', 'humid'];

export function wateringZone(idealHumidity: number): WateringZone {
  return idealHumidity < 50 ? 'dry' : idealHumidity < 70 ? 'balanced' : 'humid';
}

const ZONE_RANK: Readonly<Record<WateringZone, number>> = { dry: 0, balanced: 1, humid: 2 };

interface ZoneShare {
  readonly zone: WateringZone;
  readonly plants: number;
  /** m² of footprint in this zone. */
  readonly area: number;
  /** Fraction of the PLANTED area (0..1) — the bar segments sum to 1. */
  readonly share: number;
}

/** How the planted surface splits across the three watering zones. */
export function zoneBreakdown(
  plants: readonly Pick<Plant, 'idealHumidityLevel' | 'surfaceAreaRequired'>[],
): readonly ZoneShare[] {
  const planted = plants.filter((p) => p.surfaceAreaRequired > 0);
  const total = planted.reduce((sum, p) => sum + p.surfaceAreaRequired, 0);
  return WATERING_ZONE_ORDER.map((zone) => {
    const members = planted.filter((p) => wateringZone(p.idealHumidityLevel) === zone);
    const area = members.reduce((sum, p) => sum + p.surfaceAreaRequired, 0);
    return { zone, plants: members.length, area, share: total > 0 ? area / total : 0 };
  });
}

// ── Neighbour conflicts ──────────────────────────────────────────────────────

/** Beds closer than this (m) share a watering pass — they are neighbours. */
const NEIGHBOUR_GAP = 0.3;
/** A humidity gap this wide (points) cannot be served by one watering routine. */
export const CONFLICT_MIN_DELTA = 25;

export interface WateringConflict {
  readonly a: number;
  readonly b: number;
  /** |ideal humidity a − ideal humidity b|, in percentage points. */
  readonly delta: number;
  /** Where the two beds meet: their shared edge, or the middle of the gap. */
  readonly edge: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };
  /** The badge spot — the middle of that edge, clear of both beds' name plates. */
  readonly at: Point;
}

/** Shortest distance between two boxes (0 when they touch or overlap). */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * Neighbouring beds whose ideal humidity is too far apart to share a
 * watering pass: one of them will always be over- or under-watered. Derived
 * from the gardener's own arrangement and the plants' configured preferences;
 * strongest conflict first, then by id — deterministic.
 */
export function findWateringConflicts(
  plots: readonly PlotBox[],
  humidityOf: (plantId: number) => number | undefined,
  gap = NEIGHBOUR_GAP,
  minDelta = CONFLICT_MIN_DELTA,
): readonly WateringConflict[] {
  const conflicts: WateringConflict[] = [];
  for (let i = 0; i < plots.length; i++) {
    for (let j = i + 1; j < plots.length; j++) {
      const [a, b] =
        plots[i].plantId < plots[j].plantId ? [plots[i], plots[j]] : [plots[j], plots[i]];
      const ha = humidityOf(a.plantId);
      const hb = humidityOf(b.plantId);
      if (ha === undefined || hb === undefined) {
        continue;
      }
      const delta = Math.abs(ha - hb);
      if (delta >= minDelta && boxGap(a, b) <= gap + EPS) {
        conflicts.push({ a: a.plantId, b: b.plantId, delta, ...contact(a, b) });
      }
    }
  }
  return conflicts.sort((p, q) => q.delta - p.delta || p.a - q.a || p.b - q.b);
}

/**
 * Every bed's neighbours — the beds close enough to share its watering pass
 * (the same distance the clash check uses) — nearest first, then by id, so a
 * list built from it reads the same on every visit.
 */
export function findNeighbours(
  plots: readonly PlotBox[],
  gap = NEIGHBOUR_GAP,
): ReadonlyMap<number, readonly number[]> {
  const near = new Map<number, { id: number; distance: number }[]>(
    plots.map((p) => [p.plantId, []]),
  );
  for (let i = 0; i < plots.length; i++) {
    for (let j = i + 1; j < plots.length; j++) {
      const distance = boxGap(plots[i], plots[j]);
      if (distance <= gap + EPS) {
        near.get(plots[i].plantId)?.push({ id: plots[j].plantId, distance });
        near.get(plots[j].plantId)?.push({ id: plots[i].plantId, distance });
      }
    }
  }
  return new Map(
    [...near].map(([id, list]) => [
      id,
      list.sort((a, b) => a.distance - b.distance || a.id - b.id).map((n) => n.id),
    ]),
  );
}

/**
 * Where two nearby boxes meet. Per axis: the stretch they share if they
 * overlap along it, else the middle of the gap between them — so side-by-side
 * beds get their shared edge, stacked beds their shared top/bottom edge.
 */
function contact(a: Box, b: Box): Pick<WateringConflict, 'edge' | 'at'> {
  const [x1, x2] = shared(a.x, a.x + a.w, b.x, b.x + b.w);
  const [y1, y2] = shared(a.y, a.y + a.h, b.y, b.y + b.h);
  return { edge: { x1, y1, x2, y2 }, at: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
}

function shared(a1: number, a2: number, b1: number, b2: number): [number, number] {
  const lo = Math.max(a1, b1);
  const hi = Math.min(a2, b2);
  return lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2];
}

// ── Smart arrangement ────────────────────────────────────────────────────────

/**
 * "Group by water needs": re-places every bed (footprints unchanged — only
 * positions) so beds of the same watering zone sit together, driest zone
 * first when that fits. Beds are packed with a deterministic bottom-left
 * heuristic: each takes the top-most (then left-most) spot where it fits
 * without overlapping or crossing the fence; row-major and column-major
 * passes are tried over a few in-zone orders, and the zone order is reversed
 * as a last resort. Returns null only when none of those fits — the caller
 * then leaves the plan untouched and says so.
 */
export function arrangeByWateringZone(
  surface: Surface,
  plots: readonly PlotBox[],
  humidityOf: (plantId: number) => number | undefined,
): Readonly<Record<number, Point>> | null {
  const humidity = (p: PlotBox): number => humidityOf(p.plantId) ?? 0;
  const zone = (p: PlotBox): number => ZONE_RANK[wateringZone(humidity(p))];
  const beds = plots.filter((p) => p.w > 0 && p.h > 0);
  // Zones stay contiguous in every attempt; what varies is which zone leads
  // and how beds are ordered inside a zone — tall or wide beds often only fit
  // when they go first. Deterministic: the first attempt that fits wins.
  const within: readonly ((a: PlotBox, b: PlotBox) => number)[] = [
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
    (a, b) => humidity(a) - humidity(b),
  ];
  for (const lead of [1, -1]) {
    for (const cmp of within) {
      const order = [...beds].sort(
        (a, b) => (zone(a) - zone(b)) * lead || cmp(a, b) || a.plantId - b.plantId,
      );
      const placed = pack(surface, order, 'rows') ?? pack(surface, order, 'columns');
      if (placed) {
        return placed;
      }
    }
  }
  return null;
}

function pack(
  surface: Surface,
  order: readonly PlotBox[],
  major: 'rows' | 'columns',
): Readonly<Record<number, Point>> | null {
  const placed: Box[] = [];
  const out: Record<number, Point> = {};
  for (const bed of order) {
    // Anchors: the fence (near and far side) and every placed bed's far edges.
    const xs = [0, surface.width - bed.w, ...placed.map((r) => r.x + r.w)];
    const ys = [0, surface.height - bed.h, ...placed.map((r) => r.y + r.h)];
    let best: Point | null = null;
    for (const x of xs) {
      for (const y of ys) {
        if (x + bed.w > surface.width + EPS || y + bed.h > surface.height + EPS) {
          continue;
        }
        const box = { x, y, w: bed.w, h: bed.h };
        if (placed.some((r) => overlaps(r, box))) {
          continue;
        }
        if (!best || isBefore({ x, y }, best, major)) {
          best = { x, y };
        }
      }
    }
    if (!best) {
      return null;
    }
    placed.push({ x: best.x, y: best.y, w: bed.w, h: bed.h });
    out[bed.plantId] = best;
  }
  return out;
}

function isBefore(p: Point, q: Point, major: 'rows' | 'columns'): boolean {
  const [p1, p2, q1, q2] = major === 'rows' ? [p.y, p.x, q.y, q.x] : [p.x, p.y, q.x, q.y];
  return p1 < q1 - EPS || (Math.abs(p1 - q1) <= EPS && p2 < q2 - EPS);
}

// ── Planting timeline ────────────────────────────────────────────────────────

/** The UTC calendar day of a plantation date ('YYYY-MM-DD'), or null if unreadable. */
export function plantingDay(plantationDate: string): string | null {
  const time = Date.parse(plantationDate);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

/** Every distinct planting day in the garden, oldest first. */
export function plantingDays(plants: readonly Pick<Plant, 'plantationDate'>[]): readonly string[] {
  const days = new Set<string>();
  for (const p of plants) {
    const day = plantingDay(p.plantationDate);
    if (day) {
      days.add(day);
    }
  }
  return [...days].sort();
}

/**
 * Which plants were already in the ground on `day`. A plant with an
 * unreadable date is treated as always present — the timeline never hides a
 * real bed because of a data quirk.
 */
export function plantedBy(
  plants: readonly Pick<Plant, 'plantId' | 'plantationDate'>[],
  day: string,
): ReadonlySet<number> {
  return new Set(
    plants
      .filter((p) => {
        const d = plantingDay(p.plantationDate);
        return d === null || d <= day;
      })
      .map((p) => p.plantId),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
