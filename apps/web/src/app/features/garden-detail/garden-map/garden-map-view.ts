import type { Garden, Plant } from '../../../core/api/models';
import { plantHumidityDelta } from '../../../domain/garden-insights/garden-insights';
import type { computeGardenMapLayout } from '../../../domain/garden-map-layout/garden-map-layout';
import {
  type Box,
  type WateringZone,
  wateringZone,
} from '../../../domain/garden-planner/garden-planner';
import {
  type PlantVisual,
  computeVegetation,
  resolvePlantVisual,
} from '../../../shared/ui/plant-visuals/plant-visual-resolver';

/**
 * The Garden Map's view model: pure functions from the layout (in metres) to
 * what the SVG template draws — bed geometry and artwork, the free-soil
 * annotation, the creation ghost, dimension lines and the camera's frame.
 * No Angular and no state: the component wires these to its signals.
 */

type MapLayout = ReturnType<typeof computeGardenMapLayout>;

interface VegView {
  /** Top-left corner + size of the <use>, absolute map units. */
  readonly ax: number;
  readonly ay: number;
  readonly size: number;
  readonly cx: number;
  readonly cy: number;
  readonly rotation: number;
}

interface SoilView {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rx: number;
}

export interface PlotView {
  readonly plantId: number;
  readonly label: string;
  /** Untruncated name — for the tooltip and aria. */
  readonly fullLabel: string;
  readonly plantType: Plant['plantType'];
  readonly requiredArea: number;
  readonly share: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  /** The planting soil inside the raised bed's wooden frame. */
  readonly soil: SoilView;
  readonly fontSize: number;
  readonly showLabel: boolean;
  readonly aria: string;
  readonly humidityDelta: number;
  readonly zone: WateringZone;
  /** Presentational artwork (ADR-007 visual layer) — never domain data. */
  readonly visual: PlantVisual;
  readonly paletteStyle: string;
  readonly veg: readonly VegView[];
  readonly labelW: number;
  readonly labelH: number;
  readonly labelY: number;
}

/** A box in map units — the camera's world at zoom 1. */
export interface MapBox {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

export interface StageSize {
  readonly width: number;
  readonly height: number;
}

export interface FreeHint {
  readonly kind: 'label' | 'label-vertical' | 'marker';
  readonly cx: number;
  readonly cy: number;
  readonly fs: number;
}

/**
 * Screen room (px) the Fit view keeps clear around the garden. The toolbar
 * floats over the top band and the capacity HUD over the bottom one, so at
 * Fit neither ever covers a bed or its name plate. Each band is capped at a
 * share of the stage, so a small phone stage still gives the garden most of
 * its height.
 */
const FRAME = { top: 60, bottom: 64, side: 24 } as const;
const FRAME_MAX_SHARE = { vertical: 0.17, side: 0.05 } as const;

export const sameSize = (a: StageSize | null, b: StageSize | null): boolean =>
  a === b || (!!a && !!b && a.width === b.width && a.height === b.height);

export const sameBox = (a: MapBox, b: MapBox): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * The camera's world box — what zoom 1 ("Fit") shows. It has the STAGE's
 * shape, so `preserveAspectRatio="meet"` never letterboxes, and it places the
 * garden centred in the stage area left clear of the toolbar and HUD bands
 * (FRAME), so at Fit the controls float over lawn, never over beds. Until the
 * stage is measured it is the garden itself.
 */
export function frameContent(world: StageSize, stage: StageSize | null): MapBox {
  const { width, height } = world;
  if (!stage) {
    return { width, height, x: 0, y: 0 };
  }
  const top = Math.min(FRAME.top, stage.height * FRAME_MAX_SHARE.vertical);
  const bottom = Math.min(FRAME.bottom, stage.height * FRAME_MAX_SHARE.vertical);
  const side = Math.min(FRAME.side, stage.width * FRAME_MAX_SHARE.side);
  const availW = Math.max(stage.width - 2 * side, 1);
  const availH = Math.max(stage.height - top - bottom, 1);
  const scale = Math.min(availW / width, availH / height); // px per map unit at Fit
  return {
    width: stage.width / scale,
    height: stage.height / scale,
    x: -(side + (availW - width * scale) / 2) / scale,
    y: -(top + (availH - height * scale) / 2) / scale,
  };
}

/** Every bed as the template draws it: frame, soil, artwork and name plate. */
export function buildPlotViews(
  layout: MapLayout,
  plants: readonly Plant[],
  garden: Garden,
): readonly PlotView[] {
  const base = layout.width;
  const minVeg = base * 0.09;
  return layout.plots.map((p) => {
    const fontSize = Math.min(p.h * 0.16, base * 0.019);
    // Name-plate fitting (~0.68 em/glyph at weight 650): the pill NEVER
    // exceeds its bed; long names truncate. Area lives in the tooltip,
    // inspector and table — the map stays imagery-first.
    const pad = fontSize * 1.4;
    const fits = (text: string): boolean => text.length * fontSize * 0.68 + pad <= p.w * 0.92;
    let labelText = p.label;
    if (!fits(labelText)) {
      const maxChars = Math.max(1, Math.floor((p.w * 0.92 - pad) / (fontSize * 0.68)) - 1);
      labelText = `${p.label.slice(0, maxChars).trimEnd()}…`;
    }
    const label = labelText;

    const plant = plants.find((pl) => pl.plantId === p.plantId);
    const humidityDelta = plant ? plantHumidityDelta(garden, plant) : 0;
    const visual = resolvePlantVisual(
      plant ?? {
        plantId: p.plantId,
        plantName: p.label,
        species: '',
        plantType: p.plantType,
      },
    );
    const labelH = fontSize * 1.7;
    // Vegetation grows in the footprint above the label band.
    const vegH = Math.max(p.h - labelH * 0.9, p.h * 0.55);
    const veg: VegView[] = computeVegetation(visual.seed, p.w * 0.94, vegH * 0.96, minVeg).map(
      (v) => {
        const cx = p.x + p.w * 0.03 + v.x;
        const cy = p.y + vegH * 0.02 + v.y;
        return {
          ax: cx - v.size / 2,
          ay: cy - v.size / 2,
          size: v.size,
          cx,
          cy,
          rotation: visual.rotation + v.rotation,
        };
      },
    );
    const showLabel = p.share >= 0.04 && p.w > base * 0.14 && label.length > 1;
    const labelW = Math.min(p.w * 0.92, label.length * fontSize * 0.68 + pad);
    const rx = Math.min(p.w, p.h) * 0.14;
    // The raised bed's wooden frame: thick enough to read, never a slab.
    const frame = Math.min(Math.max(Math.min(p.w, p.h) * 0.07, base * 0.005), base * 0.018);
    return {
      plantId: p.plantId,
      label,
      fullLabel: p.label,
      plantType: p.plantType,
      requiredArea: p.requiredArea,
      share: p.share,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      cx: p.x + p.w / 2,
      cy: p.y + p.h / 2,
      rx,
      soil: {
        x: p.x + frame,
        y: p.y + frame,
        w: Math.max(p.w - frame * 2, 0),
        h: Math.max(p.h - frame * 2, 0),
        rx: Math.max(rx - frame * 0.7, 0),
      },
      fontSize,
      showLabel,
      aria: $localize`${p.label}:plantName:, ${p.requiredArea}:area: square meters, ${Math.round(p.share * 100)}:sharePct: percent of the garden. Drag or use the arrow keys to move it; Home returns it to its automatic spot.`,
      humidityDelta,
      zone: wateringZone(plant?.idealHumidityLevel ?? garden.targetHumidityLevel),
      visual,
      paletteStyle: `--pv-a:${visual.palette.a};--pv-b:${visual.palette.b};--pv-c:${visual.palette.c}`,
      veg,
      labelW,
      labelH,
      labelY: p.y + p.h - labelH * 0.78,
    };
  });
}

/**
 * Free-soil annotation: make the remaining capacity explicit on the map. The
 * label is drawn only where it genuinely fits the open ground — horizontally,
 * else rotated along a tall spot — and a spot too small for either gets a
 * compact "+" marker, so 0.5 m² is visible without pretending to be more.
 */
export function freeHintFor(layout: StageSize, spot: Box): FreeHint {
  const cx = spot.x + spot.w / 2;
  const cy = spot.y + spot.h / 2;
  const maxFs = layout.width * 0.019;
  const minFs = layout.width * 0.011;
  // "Available · 12.5 m²" ≈ 18 glyphs at ~0.62 em, plus breathing room.
  const lengthPerFs = 18 * 0.62 * 1.12;
  const along = (length: number, across: number): number =>
    Math.min(maxFs, across * 0.3, length / lengthPerFs);
  const horizontal = along(spot.w, spot.h);
  if (horizontal >= minFs) {
    return { kind: 'label', cx, cy, fs: horizontal };
  }
  const vertical = along(spot.h, spot.w);
  if (vertical >= minFs) {
    return { kind: 'label-vertical', cx, cy, fs: vertical };
  }
  return {
    kind: 'marker',
    cx,
    cy,
    fs: Math.max(Math.min(spot.w, spot.h) * 0.42, layout.width * 0.008),
  };
}

/** Dashed "planting zone" hints across the open ground of an empty garden. */
export function emptyZonesFor(spot: Box): readonly { cx: number; cy: number; r: number }[] {
  const r = Math.min(spot.h / 2, spot.w / 8) * 0.72;
  return [0.24, 0.5, 0.76].map((f) => ({
    cx: spot.x + spot.w * f,
    cy: spot.y + spot.h / 2,
    r,
  }));
}

/** Placeholder bed for an in-flight POST, sized by the requested area, in the open ground. */
export function ghostBedFor(
  area: number,
  layout: StageSize,
  spot: Box | null,
): { x: number; y: number; w: number; h: number; rx: number } {
  let w = Math.sqrt(area * 1.3);
  let h = area / w;
  const maxW = (spot?.w ?? layout.width * 0.9) * 0.9;
  const maxH = (spot?.h ?? layout.height * 0.4) * 0.9;
  if (w > maxW) {
    w = maxW;
    h = area / w;
  }
  if (h > maxH) {
    h = maxH;
    w = Math.min(area / h, maxW);
  }
  const cx = spot ? spot.x + spot.w / 2 : layout.width / 2;
  const cy = spot ? spot.y + spot.h / 2 : layout.height * 0.72;
  return { x: cx - w / 2, y: cy - h / 2, w, h, rx: Math.min(w, h) * 0.14 };
}

/**
 * Dimension lines for the bed in hand: its real width and depth in metres —
 * w × h is exactly its required m².
 */
export function dimensionsFor(plot: PlotView, base: number) {
  const off = base * 0.024;
  const fs = base * 0.015;
  const tick = fs * 0.45;
  const topY = plot.y - off;
  const leftX = plot.x - off;
  const leftLabelX = leftX - fs * 0.75;
  return {
    fs,
    w: plot.w,
    h: plot.h,
    topPath:
      `M${plot.x} ${topY}H${plot.x + plot.w}` +
      `M${plot.x} ${topY - tick}V${topY + tick}M${plot.x + plot.w} ${topY - tick}V${topY + tick}`,
    leftPath:
      `M${leftX} ${plot.y}V${plot.y + plot.h}` +
      `M${leftX - tick} ${plot.y}H${leftX + tick}M${leftX - tick} ${plot.y + plot.h}H${leftX + tick}`,
    top: { x: plot.x + plot.w / 2, y: topY - fs * 0.75 },
    left: {
      x: leftLabelX,
      y: plot.y + plot.h / 2,
      transform: `rotate(-90 ${leftLabelX} ${plot.y + plot.h / 2})`,
    },
  };
}
