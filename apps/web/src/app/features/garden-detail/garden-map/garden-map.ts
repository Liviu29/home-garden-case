import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { Garden, Plant } from '../../../core/api/models';
import {
  CAPACITY_STATUS_LABEL,
  capacityStatus,
  freeSurfaceArea,
  occupancyRatio,
  plantHumidityDelta,
  usedSurfaceArea,
} from '../../../shared/utils/garden-insights';
import {
  PLANNER_SNAP,
  applyPositions,
  clampPosition,
  computeGardenMapLayout,
  findOverlappingPlots,
  settleDrop,
} from '../../../shared/utils/garden-map-layout';
import {
  WATERING_ZONES,
  WateringZone,
  arrangeByWateringZone,
  findWateringConflicts,
  largestFreeRect,
  plantedBy,
  plantingDays,
  wateringZone,
  zoneBreakdown,
} from '../../../shared/utils/garden-planner';
import { LayoutPositions } from './garden-layout-repository';
import { MapInspector } from './map-inspector';
import {
  PlantVisual,
  computeVegetation,
  resolvePlantVisual,
} from '../../../shared/utils/plant-visual-resolver';
import {
  CameraState,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  clampCamera,
  fitCamera,
  focusOn,
  isFitted,
  panBy,
  viewBoxOf,
  zoomBy,
} from './map-camera';

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

interface PlotView {
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

interface LayerToggles {
  readonly labels: boolean;
  readonly footprints: boolean;
  readonly grid: boolean;
  readonly humidity: boolean;
  readonly zones: boolean;
  readonly freeSpace: boolean;
}

interface TooltipView {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly area: number;
  readonly sharePct: number;
}

/** A box in map units — the camera's world at zoom 1. */
interface MapBox {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

interface StageSize {
  readonly width: number;
  readonly height: number;
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

/** Within this many screen px, a dropped bed's edge snaps to a fence, a bed edge or home. */
const EDGE_SNAP_PX = 12;

/** Arrow-key nudges (a keyboard alternative to dragging — WCAG 2.5.7). */
const ARROW_STEPS: Readonly<Record<string, { readonly x: number; readonly y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** One planting day per beat when the timeline replays the garden. */
const TIMELINE_STEP_MS = 900;

const NO_IDS: ReadonlySet<number> = new Set();

const snapToGrid = (value: number): number => Math.round(value / PLANNER_SNAP) * PLANNER_SNAP;

/** "1.25" — for spoken positions. */
const metres = (value: number): string => String(Math.round(value * 100) / 100);

const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const sameSize = (a: { width: number; height: number } | null, b: typeof a): boolean =>
  a === b || (!!a && !!b && a.width === b.width && a.height === b.height);

const sameBox = (a: MapBox, b: MapBox): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * Interactive Garden Map — a lightweight digital twin of one garden (ADR-007).
 *
 * Consumes plain `Garden` + `Plant[]` (never owns business state), derives a
 * deterministic layout via `computeGardenMapLayout`, and renders it as SVG with
 * a clamped pan/zoom camera. All HUD numbers come from the shared domain
 * functions — the renderer never re-implements capacity math.
 *
 * Planner tools (INTERACTIVE-GARDEN-UX.md): beds move by drag or arrow keys,
 * magnetise to the fence, to neighbours (with smart guides) and to their own
 * automatic spot; the free soil is whatever ground no bed covers; watering
 * zones, neighbour clashes, "Group by water needs" and a planting timeline
 * are all derived from the plants' real preferences and dates.
 *
 * Interaction state (camera, selection, hover, timeline) is component-local
 * signals; renderer-only animation is pure CSS gated by
 * `prefers-reduced-motion` — no signal writes per frame (zoneless).
 */
@Component({
  selector: 'app-garden-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatButtonModule, MapInspector],
  templateUrl: './garden-map.html',
  styleUrl: './garden-map.scss',
  // The component styles its own fullscreen stretch — no ::ng-deep from the
  // parent reaching into this template.
  host: { '[class.fullscreen]': 'isFullscreen()' },
})
export class GardenMap {
  readonly garden = input.required<Garden>();
  readonly plants = input.required<readonly Plant[]>();

  readonly addPlant = output<void>();
  readonly editPlant = output<Plant>();
  readonly removePlant = output<Plant>();

  // ── Planner wiring: position state is owned by the
  // parent (persisted locally there); the map renders and emits intents.
  readonly positions = input<LayoutPositions>({});
  readonly hasCustomLayout = input(false);
  readonly canUndo = input(false);
  readonly canRedo = input(false);
  readonly isFullscreen = input(false);
  readonly positionChange = output<{ plantId: number; x: number; y: number }>();
  /** One bed back to its automatic spot. */
  readonly resetPosition = output<number>();
  /** A whole new arrangement, committed as ONE undoable step. */
  readonly arrangePositions = output<LayoutPositions>();
  readonly undoLayout = output<void>();
  readonly redoLayout = output<void>();
  readonly resetLayout = output<void>();
  readonly toggleFullscreen = output<void>();

  /** Layer visibility — map-local UI state with sensible defaults. */
  protected readonly layers = signal<LayerToggles>({
    labels: true,
    footprints: true,
    grid: true,
    humidity: false,
    zones: false,
    freeSpace: true,
  });
  protected readonly layersOpen = signal(false);
  protected readonly zoneLegend = WATERING_ZONES;

  protected toggleLayer(key: keyof LayerToggles): void {
    this.layers.set({ ...this.layers(), [key]: !this.layers()[key] });
  }

  protected showZones(): void {
    this.layers.set({ ...this.layers(), zones: true });
  }

  private readonly mapSvg = viewChild.required<ElementRef<SVGSVGElement>>('mapSvg');

  // ── Derived scene (pure) ──────────────────────────────────────────────────
  /** In-flight drag override — merged over persisted positions while dragging. */
  private readonly dragOverride = signal<{ plantId: number; x: number; y: number } | null>(null);

  /** True while a bed is being dragged — the HUD fades so it never hides the drop zone. */
  protected readonly draggingPlant = computed(() => this.dragOverride() !== null);
  protected readonly draggingId = computed(() => this.dragOverride()?.plantId ?? null);

  /** The automatic arrangement — every bed's HOME spot. */
  private readonly autoLayout = computed(() =>
    computeGardenMapLayout(this.garden(), this.plants()),
  );

  protected readonly layout = computed(() => {
    const drag = this.dragOverride();
    const positions = drag
      ? { ...this.positions(), [drag.plantId]: { x: drag.x, y: drag.y } }
      : this.positions();
    return applyPositions(this.autoLayout(), positions);
  });

  /** Visual-arrangement overlaps (never a capacity verdict — see docs). */
  protected readonly overlappingIds = computed(() => findOverlappingPlots(this.layout().plots));

  private readonly humidityById = computed(
    () => new Map(this.plants().map((p) => [p.plantId, p.idealHumidityLevel])),
  );

  /** Neighbouring beds that cannot share a watering pass (advice, not a rule). */
  protected readonly conflicts = computed(() => {
    const humidity = this.humidityById();
    // On the timeline, a bed not planted yet has no neighbours to clash with.
    const future = this.futureIds();
    const planted = this.layout().plots.filter((p) => !future.has(p.plantId));
    return findWateringConflicts(planted, (id) => humidity.get(id));
  });

  /**
   * Measured size of the rendered stage (px). The panel's shape is a layout
   * outcome, not a constant — wide on desktop, tall on mobile, the viewport's
   * own shape in fullscreen — so it is measured rather than assumed. `null`
   * until the observer reports (and always in jsdom, which has none).
   */
  private readonly stageSize = signal<StageSize | null>(null, { equal: sameSize });

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      // jsdom has no ResizeObserver; the null size then frames the world
      // itself, which is exactly the pre-measurement behaviour the specs assert.
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.stageSize.set({ width, height });
        }
      });
      observer.observe(this.mapSvg().nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.wheelHintTimer);
      clearInterval(this.playTimer);
    });
  }

  /** Garden surface size in map units — only changes with the garden's m². */
  private readonly world = computed(
    () => ({ width: this.layout().width, height: this.layout().height }),
    { equal: sameSize },
  );

  /**
   * The camera's world box — what zoom 1 ("Fit") shows. It has the STAGE's
   * shape, so `preserveAspectRatio="meet"` never letterboxes, and it places
   * the garden centred in the stage area left clear of the toolbar and HUD
   * bands (FRAME), so at Fit the controls float over lawn, never over beds.
   * Until the stage is measured it is the garden itself.
   */
  protected readonly content = computed<MapBox>(
    () => {
      const { width, height } = this.world();
      const stage = this.stageSize();
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
    },
    { equal: sameBox },
  );

  /** Lawn corner radius — small enough that a bed in a corner stays inside the fence. */
  protected readonly cornerR = computed(() => this.layout().width * 0.03);
  /** The fence runs just OUTSIDE the planting surface, so edge beds sit inside it. */
  protected readonly fenceGap = computed(() => this.layout().width * 0.014);

  protected readonly plotViews = computed<readonly PlotView[]>(() => {
    const layout = this.layout();
    const plants = this.plants();
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
      const humidityDelta = plant ? plantHumidityDelta(this.garden(), plant) : 0;
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
        aria:
          `${p.label}, ${p.requiredArea} square meters, ${Math.round(p.share * 100)} percent of the garden. ` +
          'Drag or use the arrow keys to move it; Home returns it to its automatic spot.',
        humidityDelta,
        zone: wateringZone(plant?.idealHumidityLevel ?? this.garden().targetHumidityLevel),
        visual,
        paletteStyle: `--pv-a:${visual.palette.a};--pv-b:${visual.palette.b};--pv-c:${visual.palette.c}`,
        veg,
        labelW,
        labelH,
        labelY: p.y + p.h - labelH * 0.78,
      };
    });
  });

  /**
   * Paint order. SVG has no z-index — later nodes paint on top — so the bed
   * being dragged is rendered last and slides OVER its neighbours instead of
   * disappearing under whichever bed happens to come later in the list.
   */
  protected readonly paintOrder = computed<readonly PlotView[]>(() => {
    const views = this.plotViews();
    const id = this.draggingId();
    return id === null
      ? views
      : [...views.filter((v) => v.plantId !== id), ...views.filter((v) => v.plantId === id)];
  });

  /**
   * The open ground. Free soil is drawn as the garden MINUS every bed (an SVG
   * mask), so it is always where the ground really is: in the automatic
   * arrangement that is the free treemap cell; after a bed moves, the spot it
   * left becomes tilled soil and the spot it took stops being "available".
   * The annotation goes in the largest empty rectangle.
   */
  protected readonly freeSpot = computed(() => largestFreeRect(this.layout(), this.layout().plots));

  /**
   * Free-soil annotation: make the remaining capacity explicit on the
   * map. The label is drawn only where it genuinely fits the open ground —
   * horizontally, else rotated along a tall spot — and a spot too small for
   * either gets a compact "+" marker so 0.5 m² is visible without pretending
   * to be more. Hidden mid-drag (the ground is changing under the cursor)
   * and while the timeline replays the past.
   */
  protected readonly freeHint = computed<{
    kind: 'label' | 'label-vertical' | 'marker';
    cx: number;
    cy: number;
    fs: number;
  } | null>(() => {
    const layout = this.layout();
    const spot = this.freeSpot();
    if (!spot || this.plants().length === 0 || this.draggingPlant() || this.timelineOpen()) {
      return null; // an empty garden keeps its dedicated "planting zone" hints
    }
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
  });

  /** Dashed "planting zone" hints, only when the garden is truly empty. */
  protected readonly emptyZones = computed(() => {
    const spot = this.freeSpot();
    if (!spot || this.plants().length > 0) {
      return [];
    }
    const r = Math.min(spot.h / 2, spot.w / 8) * 0.72;
    return [0.24, 0.5, 0.76].map((f) => ({
      cx: spot.x + spot.w * f,
      cy: spot.y + spot.h / 2,
      r,
    }));
  });

  // ── HUD (delegates to the shared domain math — never re-implemented) ─────
  protected readonly usedArea = computed(() => usedSurfaceArea(this.plants()));
  protected readonly freeArea = computed(() => freeSurfaceArea(this.garden(), this.plants()));
  protected readonly utilizationPct = computed(() =>
    Math.min(100, occupancyRatio(this.garden(), this.plants()) * 100),
  );
  protected readonly status = computed(() => capacityStatus(this.garden(), this.plants()));
  protected readonly statusLabel = computed(() => CAPACITY_STATUS_LABEL[this.status()]);

  protected readonly mapAria = computed(
    () =>
      `Map of ${this.garden().gardenName}: ${this.plants().length} plants, ` +
      `${Math.round(this.utilizationPct())} percent of ${this.garden().totalSurfaceArea} square meters used, ` +
      `target humidity ${this.garden().targetHumidityLevel} percent. ` +
      `Pan with arrow keys, zoom with plus and minus. Focus a bed to move it with its arrow keys.`,
  );

  // ── Camera ────────────────────────────────────────────────────────────────
  // Linked to the frame, never to the layout: moving a bed must not touch the
  // view. When the frame changes (a resize, fullscreen, a new garden size) a
  // camera still at Fit follows it — the garden stays framed — while a view
  // the gardener zoomed or panned is kept, only re-clamped to the new frame.
  private readonly camera = linkedSignal<MapBox, CameraState>({
    source: this.content,
    computation: (content, previous) =>
      !previous || isFitted(previous.value, previous.source)
        ? fitCamera(content)
        : clampCamera(previous.value, content),
  });
  protected readonly viewBox = computed(() => viewBoxOf(this.camera(), this.content()));
  protected readonly zoomPercent = computed(() => Math.round(this.camera().zoom * 100));
  protected readonly minZoom = MIN_ZOOM;
  protected readonly maxZoom = MAX_ZOOM;
  protected readonly zoom = computed(() => this.camera().zoom);
  /** Zoom-dependent detail: area text joins the labels when zoomed in. */
  protected readonly detailZoom = computed(() => this.camera().zoom >= 1.35);

  /** Screen px per map unit at the current view — null until the stage is measured. */
  private readonly unitPx = computed(() => {
    const stage = this.stageSize();
    if (!stage) {
      return null;
    }
    const { width, height } = this.content();
    const zoom = this.camera().zoom;
    return Math.min((stage.width * zoom) / width, (stage.height * zoom) / height);
  });

  // ── Mutation ghosts (ASYNC-UX.md): ids whose visuals render as gray ghosts
  readonly pendingDeletes = input<readonly number[]>([]);
  readonly pendingUpdates = input<readonly number[]>([]);
  /** m² of a plant creation in flight — renders a placeholder bed (not state). */
  readonly pendingCreateArea = input<number | null>(null);

  protected readonly mutatingIds = computed(
    () => new Set([...this.pendingDeletes(), ...this.pendingUpdates()]),
  );

  /** Placeholder bed for an in-flight POST, sized by the requested area. */
  protected readonly ghostBed = computed(() => {
    const area = this.pendingCreateArea();
    if (area === null || area <= 0) {
      return null;
    }
    const layout = this.layout();
    const spot = this.freeSpot();
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
  });

  /**
   * Where the dragged bed will land if dropped now: home (its automatic spot)
   * when it is brought back near it, else its edges magnetise to the fence
   * and neighbouring beds (with smart guides), else it snaps to the m² grid.
   * Drawn as a dashed outline during the drag, and it is exactly what the
   * drop commits — so the bed never lands somewhere the gardener did not see.
   * The home slot stays outlined while the bed is away from it.
   */
  protected readonly dropPreview = computed(() => {
    const id = this.draggingId();
    const layout = this.layout();
    const plot = layout.plots.find((p) => p.plantId === id);
    if (!plot) {
      return null;
    }
    const unitPx = this.unitPx();
    const threshold = unitPx ? EDGE_SNAP_PX / unitPx : PLANNER_SNAP / 2;
    const home = this.autoLayout().plots.find((p) => p.plantId === plot.plantId) ?? null;
    const at = settleDrop(layout, plot.plantId, plot, threshold, home);
    const fs = layout.width * 0.016;
    return {
      plantId: plot.plantId,
      x: at.x,
      y: at.y,
      w: plot.w,
      h: plot.h,
      rx: Math.min(plot.w, plot.h) * 0.14,
      guides: at.guides,
      atHome: at.home,
      home:
        home && (Math.abs(home.x - at.x) > 1e-6 || Math.abs(home.y - at.y) > 1e-6)
          ? { x: home.x, y: home.y, cx: home.x + home.w / 2, cy: home.y + home.h / 2 }
          : null,
      readout: {
        x: at.x + plot.w / 2,
        // Below the target (the dimension line owns the space above); a bed
        // against the bottom fence reads it just inside its top edge instead.
        y: at.y + plot.h + fs * 1.8 <= layout.height ? at.y + plot.h + fs * 0.9 : at.y + fs * 1.1,
        fs,
        text: at.home ? 'Back to its auto spot' : `x ${metres(at.x)} m · y ${metres(at.y)} m`,
      },
    };
  });

  /**
   * Dimension lines for the bed in hand (dragged, else selected): its real
   * width and depth in metres — w × h is exactly its required m².
   */
  protected readonly dimensions = computed(() => {
    const id = this.draggingId() ?? this.selectedPlantId();
    const plot = this.plotViews().find((p) => p.plantId === id);
    if (!plot || this.mutatingIds().has(plot.plantId)) {
      return null;
    }
    const base = this.layout().width;
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
  });

  // ── Selection & hover (shared with the plants table via model two-way) ───
  readonly selectedPlantId = model<number | null>(null);
  /** Deleted/absent plants can never stay "selected" — derived, not stored. */
  protected readonly selectedPlant = computed(
    () => this.plants().find((p) => p.plantId === this.selectedPlantId()) ?? null,
  );
  protected readonly selectedPlantMutating = computed(() => {
    const id = this.selectedPlantId();
    return id !== null && this.mutatingIds().has(id);
  });
  /** A DELETE (not a PUT) is in flight — the inspector names the right operation. */
  protected readonly selectedPlantDeleting = computed(() => {
    const id = this.selectedPlantId();
    return id !== null && this.pendingDeletes().includes(id);
  });
  /** The selected bed sits where the gardener put it. */
  protected readonly selectedHasCustomPosition = computed(() => {
    const id = this.selectedPlantId();
    return id !== null && this.positions()[id] !== undefined;
  });

  protected readonly tooltip = signal<TooltipView | null>(null);

  /** Halo strength tracks the configured target — a hint, not a measurement. */
  protected readonly humidityHaloOpacity = computed(
    () => (this.garden().targetHumidityLevel / 100) * 0.35,
  );

  /** Shown briefly when a bare wheel passes over the embedded map. */
  protected readonly wheelHint = signal(false);
  private wheelHintTimer: ReturnType<typeof setTimeout> | undefined;
  /** The zoom modifier as this platform names it. */
  protected readonly zoomModifier = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')
    ? '⌘'
    : 'Ctrl';

  /** Polite screen-reader narration of planner actions (moves, regrouping, timeline). */
  protected readonly liveMessage = signal('');

  private announce(message: string): void {
    // A repeated message must be re-announced: alternate an invisible suffix
    // (a zero-width space, U+200B).
    const again = message + String.fromCharCode(0x200b);
    this.liveMessage.set(this.liveMessage() === message ? again : message);
  }

  // ── Smart arrangement ─────────────────────────────────────────────────────
  /** The last regroup found no overlap-free arrangement (resets with the plant set). */
  protected readonly arrangeBlocked = linkedSignal({
    source: this.plants,
    computation: () => false,
  });

  protected arrange(): void {
    const auto = this.autoLayout();
    const humidity = this.humidityById();
    const next = arrangeByWateringZone(auto, auto.plots, (id) => humidity.get(id));
    if (!next) {
      this.arrangeBlocked.set(true);
      this.announce('Not enough open ground to regroup these beds without overlaps.');
      return;
    }
    this.arrangeBlocked.set(false);
    this.arrangePositions.emit(next);
    this.showZones(); // the grouping only makes sense with the zones in view
    const summary = zoneBreakdown(this.plants())
      .filter((z) => z.plants > 0)
      .map((z) => `${z.plants} ${z.label.toLowerCase()}`)
      .join(', ');
    this.announce(
      `Beds regrouped by water needs, driest first: ${summary}. Undo restores your plan.`,
    );
  }

  protected returnHome(plantId: number): void {
    this.resetPosition.emit(plantId);
    const name = this.plants().find((p) => p.plantId === plantId)?.plantName ?? 'The bed';
    this.announce(`${name} returned to its automatic spot.`);
  }

  // ── Planting timeline ─────────────────────────────────────────────────────
  protected readonly timelineOpen = signal(false);
  protected readonly days = computed(() => plantingDays(this.plants()));
  /** Index into `days`; follows the plant set so it never points past the end. */
  protected readonly dayIndex = linkedSignal<readonly string[], number>({
    source: this.days,
    computation: (days, previous) =>
      Math.min(previous?.value ?? days.length - 1, Math.max(0, days.length - 1)),
  });
  protected readonly timelineDay = computed(() =>
    this.timelineOpen() ? (this.days()[this.dayIndex()] ?? null) : null,
  );
  /**
   * The day as a UTC instant, for the date pipe. A bare 'YYYY-MM-DD' is read
   * as LOCAL midnight, which the UTC-formatted label then showed as the day
   * before anywhere east of Greenwich.
   */
  protected readonly timelineDate = computed(() => {
    const day = this.timelineDay();
    return day ? `${day}T00:00:00.000Z` : null;
  });
  /** Beds not yet planted on the timeline's day — drawn as outlines of the future. */
  protected readonly futureIds = computed<ReadonlySet<number>>(() => {
    const day = this.timelineDay();
    if (!day) {
      return NO_IDS;
    }
    const planted = plantedBy(this.plants(), day);
    return new Set(
      this.plants()
        .filter((p) => !planted.has(p.plantId))
        .map((p) => p.plantId),
    );
  });
  protected readonly timelineStats = computed(() => {
    const future = this.futureIds();
    const planted = this.plants().filter((p) => !future.has(p.plantId));
    const total = this.garden().totalSurfaceArea;
    return {
      count: planted.length,
      total: this.plants().length,
      pct: total > 0 ? Math.min(100, (usedSurfaceArea(planted) / total) * 100) : 0,
    };
  });
  protected readonly playing = signal(false);
  private playTimer: ReturnType<typeof setInterval> | undefined;

  protected toggleTimeline(): void {
    if (this.timelineOpen()) {
      this.closeTimeline();
      return;
    }
    this.timelineOpen.set(true);
    this.layersOpen.set(false);
    this.dayIndex.set(0);
    this.announce(
      `Planting timeline: ${this.days().length} planting days. Showing the first, ${this.days()[0]}.`,
    );
    // The replay is the point of opening it — unless the gardener asked for
    // stillness, in which case they scrub at their own pace.
    if (!prefersReducedMotion()) {
      this.startPlayback();
    }
  }

  private closeTimeline(): void {
    this.stopPlayback();
    this.timelineOpen.set(false);
    this.announce('Timeline closed. Showing the garden today.');
  }

  protected togglePlayback(): void {
    if (this.playing()) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback(): void {
    const last = this.days().length - 1;
    if (this.dayIndex() >= last) {
      this.dayIndex.set(0);
    }
    this.playing.set(true);
    clearInterval(this.playTimer);
    this.playTimer = setInterval(() => {
      const next = Math.min(this.dayIndex() + 1, this.days().length - 1);
      this.dayIndex.set(next);
      if (next >= this.days().length - 1) {
        this.stopPlayback();
      }
    }, TIMELINE_STEP_MS);
  }

  private stopPlayback(): void {
    clearInterval(this.playTimer);
    this.playTimer = undefined;
    this.playing.set(false);
  }

  protected onScrub(event: Event): void {
    this.stopPlayback();
    this.dayIndex.set(Number((event.target as HTMLInputElement).value));
  }

  // ── Gestures (renderer-local plain fields — not application state) ───────
  // Pointer mode machine: pointerdown on a plot arms a DRAG_PLANT
  // candidate; past the threshold it drags the plant, otherwise the click
  // selects. Pointerdown on open ground pans. Modes never fight.
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private dragDistance = 0;
  private lastX = 0;
  private lastY = 0;
  private plantCandidate: { plantId: number; plotX: number; plotY: number } | null = null;

  protected zoomIn(): void {
    this.camera.set(zoomBy(this.camera(), this.content(), ZOOM_STEP));
  }

  protected zoomOut(): void {
    this.camera.set(zoomBy(this.camera(), this.content(), 1 / ZOOM_STEP));
  }

  protected fit(): void {
    this.camera.set(fitCamera(this.content()));
  }

  protected resetView(): void {
    this.fit();
    this.selectedPlantId.set(null);
  }

  protected selectPlant(plantId: number): void {
    this.selectedPlantId.set(plantId);
    const plot = this.plotViews().find((p) => p.plantId === plantId);
    if (plot) {
      // Center gently without changing zoom (a no-op at fit zoom — clamped).
      this.camera.set(
        focusOn(this.camera(), this.content(), { x: plot.cx, y: plot.cy }, this.camera().zoom),
      );
    }
  }

  protected onPlotClick(plantId: number): void {
    if (this.dragDistance < 5) {
      this.selectPlant(plantId);
    }
  }

  /** Arms a plant-drag candidate; the svg pointerdown still runs after this. */
  protected onPlotPointerDown(plantId: number): void {
    const plot = this.layout().plots.find((p) => p.plantId === plantId);
    if (plot && !this.mutatingIds().has(plantId)) {
      this.plantCandidate = { plantId, plotX: plot.x, plotY: plot.y };
    }
  }

  /**
   * Keyboard moves for a focused bed: arrows nudge it a quarter metre (Shift:
   * a metre) along the m² grid, Home returns it to its automatic spot. The
   * event stops here so the stage does not also pan the camera.
   */
  protected onPlotKeydown(plot: PlotView, event: KeyboardEvent): void {
    if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      if (this.positions()[plot.plantId]) {
        this.returnHome(plot.plantId);
      }
      return;
    }
    const dir = ARROW_STEPS[event.key];
    if (!dir) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const layout = this.layout();
    const current = layout.plots.find((p) => p.plantId === plot.plantId);
    if (!current || this.mutatingIds().has(plot.plantId)) {
      return;
    }
    const step = event.shiftKey ? 1 : PLANNER_SNAP;
    const next = clampPosition(layout, current, {
      x: snapToGrid(current.x + dir.x * step),
      y: snapToGrid(current.y + dir.y * step),
    });
    this.selectedPlantId.set(plot.plantId);
    if (Math.abs(next.x - current.x) < 1e-9 && Math.abs(next.y - current.y) < 1e-9) {
      this.announce(`${plot.fullLabel} is already against the fence.`);
      return;
    }
    this.positionChange.emit({ plantId: plot.plantId, x: next.x, y: next.y });
    this.announce(`${plot.fullLabel} moved to ${metres(next.x)} by ${metres(next.y)} metres.`);
  }

  protected focusSelected(): void {
    const id = this.selectedPlantId();
    const plot = this.plotViews().find((p) => p.plantId === id);
    if (plot) {
      this.camera.set(focusOn(this.camera(), this.content(), { x: plot.cx, y: plot.cy }, 1.8));
    }
  }

  protected clearSelection(): void {
    this.selectedPlantId.set(null);
  }

  protected onPointerDown(event: PointerEvent): void {
    // NOTE: no setPointerCapture here — capturing on pointerdown retargets the
    // compatibility `click` to the svg, which would swallow plot selection.
    // Capture starts lazily, once movement crosses the drag threshold.
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.dragDistance = 0;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (this.activePointers.size === 2) {
      this.pinchDistance = this.pointerGapPx();
      this.plantCandidate = null; // a second finger turns a bed drag into a pinch
      this.dragOverride.set(null);
      this.capture(event); // a second finger is never a click — pinch mode
    }
  }

  private capture(event: PointerEvent): void {
    const svg = this.mapSvg().nativeElement;
    if (!svg.hasPointerCapture(event.pointerId)) {
      svg.setPointerCapture(event.pointerId);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 2) {
      const gap = this.pointerGapPx();
      if (this.pinchDistance > 0 && gap > 0) {
        const mid = this.pointerMidpoint();
        this.camera.set(
          zoomBy(
            this.camera(),
            this.content(),
            gap / this.pinchDistance,
            this.screenToMap(mid.x, mid.y),
          ),
        );
      }
      this.pinchDistance = gap;
      return;
    }

    const dxPx = event.clientX - this.lastX;
    const dyPx = event.clientY - this.lastY;
    this.dragDistance += Math.abs(dxPx) + Math.abs(dyPx);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (this.dragDistance < 5) {
      return;
    }
    this.capture(event); // keep the gesture even off-element
    this.tooltip.set(null);
    const scale = this.pxPerUnit();
    if (scale === 0) {
      return;
    }

    const candidate = this.plantCandidate;
    if (candidate) {
      // DRAG_PLANT: move the bed, not the camera (visual placement only —
      // the honest footprint area never changes). The override tracks the
      // raw pointer; rendering clamps it inside the garden, and the bed stays
      // under the same point of the cursor it was grabbed by.
      const current = this.dragOverride() ?? {
        plantId: candidate.plantId,
        x: candidate.plotX,
        y: candidate.plotY,
      };
      this.dragOverride.set({
        plantId: candidate.plantId,
        x: current.x + dxPx / scale,
        y: current.y + dyPx / scale,
      });
      return;
    }
    this.camera.set(panBy(this.camera(), this.content(), -dxPx / scale, -dyPx / scale));
  }

  protected onPointerUp(event: PointerEvent): void {
    this.activePointers.delete(event.pointerId);
    this.pinchDistance = 0;

    // Drop: commit exactly the previewed spot (home, magnetised or snapped,
    // always inside the garden) — applyPositions re-clamps on render, so it
    // can never escape. Back home means no custom position at all.
    const target = this.dropPreview();
    if (target) {
      if (target.atHome) {
        if (this.positions()[target.plantId]) {
          this.returnHome(target.plantId);
        }
      } else {
        this.positionChange.emit({ plantId: target.plantId, x: target.x, y: target.y });
      }
      this.selectedPlantId.set(target.plantId);
    }
    this.dragOverride.set(null);
    this.plantCandidate = null;
    // Pinch → one finger lifted: re-anchor the pan to the remaining pointer,
    // otherwise the next move would compute a delta from the lifted finger's
    // stale position and the camera would jump.
    if (this.activePointers.size === 1) {
      const [remaining] = this.activePointers.values();
      this.lastX = remaining.x;
      this.lastY = remaining.y;
    }
  }

  protected onWheel(event: WheelEvent): void {
    // Embedded in a scrolling page, a bare wheel belongs to the PAGE: zooming
    // on it trapped the scroll and shrank the plan under a passing cursor.
    // Ctrl/⌘ + wheel zooms (so does a trackpad pinch, which browsers report
    // as ctrl + wheel); fullscreen owns the viewport, so there it always zooms.
    if (!event.ctrlKey && !event.metaKey && !this.isFullscreen()) {
      this.flashWheelHint();
      return;
    }
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.camera.set(
      zoomBy(this.camera(), this.content(), factor, this.screenToMap(event.clientX, event.clientY)),
    );
  }

  private flashWheelHint(): void {
    this.wheelHint.set(true);
    clearTimeout(this.wheelHintTimer);
    this.wheelHintTimer = setTimeout(() => this.wheelHint.set(false), 1400);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const view = this.content();
    const panStep = view.width / this.camera().zoom / 12;
    switch (event.key) {
      case 'ArrowLeft':
        this.camera.set(panBy(this.camera(), view, -panStep, 0));
        break;
      case 'ArrowRight':
        this.camera.set(panBy(this.camera(), view, panStep, 0));
        break;
      case 'ArrowUp':
        this.camera.set(panBy(this.camera(), view, 0, -panStep));
        break;
      case 'ArrowDown':
        this.camera.set(panBy(this.camera(), view, 0, panStep));
        break;
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
        this.zoomOut();
        break;
      case '0':
      case 'f':
      case 'F':
        this.fit();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /**
   * Escape cascade: layers panel → timeline → fullscreen → selection. Bound
   * on the map shell (not the SVG) so it also works with focus inside the
   * toolbar or a popover — a keyboard user must be able to Escape out.
   */
  protected onEscape(): void {
    if (this.layersOpen()) {
      this.layersOpen.set(false);
      // Focus was likely inside the popover, which just left the DOM — hand it
      // to the stage so the next Escape (and arrows/zoom keys) keep working.
      this.mapSvg().nativeElement.focus();
    } else if (this.timelineOpen()) {
      this.closeTimeline();
      this.mapSvg().nativeElement.focus();
    } else if (this.isFullscreen()) {
      this.toggleFullscreen.emit();
    } else {
      this.clearSelection();
    }
    // no preventDefault — let dialogs etc. behave normally
  }

  protected onPlotHover(plot: PlotView, event: PointerEvent): void {
    this.moveTooltip(plot, event);
  }

  protected onPlotHoverMove(plot: PlotView, event: PointerEvent): void {
    if (this.activePointers.size === 0) {
      this.moveTooltip(plot, event);
    }
  }

  protected clearHover(): void {
    this.tooltip.set(null);
  }

  private moveTooltip(plot: PlotView, event: PointerEvent): void {
    const host = this.mapSvg().nativeElement.parentElement;
    const rect = host?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    this.tooltip.set({
      x: Math.min(event.clientX - rect.left + 14, rect.width - 150),
      y: Math.max(event.clientY - rect.top - 14, 8),
      label: plot.fullLabel,
      area: plot.requiredArea,
      sharePct: Math.round(plot.share * 100),
    });
  }

  // ── Screen ↔ map-unit conversion (accounts for `meet` letterboxing) ──────
  private pxPerUnit(): number {
    const rect = this.mapSvg().nativeElement.getBoundingClientRect();
    const view = this.content();
    const vbW = view.width / this.camera().zoom;
    const vbH = view.height / this.camera().zoom;
    if (rect.width === 0 || vbW === 0) {
      return 0;
    }
    return Math.min(rect.width / vbW, rect.height / vbH);
  }

  private screenToMap(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.mapSvg().nativeElement.getBoundingClientRect();
    const view = this.content();
    const cam = this.camera();
    const vbW = view.width / cam.zoom;
    const vbH = view.height / cam.zoom;
    const scale = this.pxPerUnit();
    if (scale === 0) {
      return { x: cam.cx, y: cam.cy };
    }
    const offX = (rect.width - vbW * scale) / 2;
    const offY = (rect.height - vbH * scale) / 2;
    return {
      x: cam.cx - vbW / 2 + (clientX - rect.left - offX) / scale,
      y: cam.cy - vbH / 2 + (clientY - rect.top - offY) / scale,
    };
  }

  private pointerGapPx(): number {
    const [a, b] = [...this.activePointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private pointerMidpoint(): { x: number; y: number } {
    const [a, b] = [...this.activePointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
