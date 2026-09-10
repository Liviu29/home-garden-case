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
import { PlantThumb } from '../../../shared/ui/plant-visuals/plant-thumb';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
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
  applyPositions,
  computeGardenMapLayout,
  findOverlappingPlots,
  snapPosition,
} from '../../../shared/utils/garden-map-layout';
import { LayoutPositions } from './garden-layout-repository';
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
  fitCamera,
  focusOn,
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
  readonly fontSize: number;
  readonly showLabel: boolean;
  readonly aria: string;
  readonly humidityDelta: number;
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
  readonly freeSpace: boolean;
}

interface TooltipView {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly area: number;
  readonly sharePct: number;
}

/**
 * Interactive Garden Map — a lightweight digital twin of one garden (ADR-007).
 *
 * Consumes plain `Garden` + `Plant[]` (never owns business state), derives a
 * deterministic layout via `computeGardenMapLayout`, and renders it as SVG with
 * a clamped pan/zoom camera. All HUD numbers come from the shared domain
 * functions — the renderer never re-implements capacity math.
 *
 * Interaction state (camera, selection, hover) is component-local signals;
 * renderer-only animation (hover glow, grow-in, selection pulse) is pure CSS
 * gated by `prefers-reduced-motion` — no signal writes per frame (zoneless).
 */
@Component({
  selector: 'app-garden-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatButtonModule, PlantThumb, Skeleton],
  templateUrl: './garden-map.html',
  styleUrl: './garden-map.scss',
  // The component styles its own fullscreen stretch — no ::ng-deep from the
  // parent reaching into this template (cleanup pass §82).
  host: { '[class.fullscreen]': 'isFullscreen()' },
})
export class GardenMap {
  readonly garden = input.required<Garden>();
  readonly plants = input.required<readonly Plant[]>();

  readonly addPlant = output<void>();
  readonly editPlant = output<Plant>();
  readonly removePlant = output<Plant>();

  // ── Planner wiring (feature brief §14–19): position state is owned by the
  // parent (persisted locally there); the map renders and emits moves.
  readonly positions = input<LayoutPositions>({});
  readonly hasCustomLayout = input(false);
  readonly canUndo = input(false);
  readonly canRedo = input(false);
  readonly isFullscreen = input(false);
  readonly positionChange = output<{ plantId: number; x: number; y: number }>();
  readonly undoLayout = output<void>();
  readonly redoLayout = output<void>();
  readonly resetLayout = output<void>();
  readonly toggleFullscreen = output<void>();

  /** Layer visibility (§40) — map-local UI state with sensible defaults. */
  protected readonly layers = signal<LayerToggles>({
    labels: true,
    footprints: true,
    grid: true,
    humidity: false,
    freeSpace: true,
  });
  protected readonly layersOpen = signal(false);

  protected toggleLayer(key: keyof LayerToggles): void {
    this.layers.set({ ...this.layers(), [key]: !this.layers()[key] });
  }

  private readonly mapSvg = viewChild.required<ElementRef<SVGSVGElement>>('mapSvg');

  // ── Derived scene (pure) ──────────────────────────────────────────────────
  /** In-flight drag override — merged over persisted positions while dragging. */
  private readonly dragOverride = signal<{ plantId: number; x: number; y: number } | null>(null);

  /** True while a bed is being dragged — the HUD fades so it never hides the drop zone. */
  protected readonly draggingPlant = computed(() => this.dragOverride() !== null);

  protected readonly layout = computed(() => {
    const auto = computeGardenMapLayout(this.garden(), this.plants());
    const drag = this.dragOverride();
    const positions = drag
      ? { ...this.positions(), [drag.plantId]: { x: drag.x, y: drag.y } }
      : this.positions();
    return applyPositions(auto, positions);
  });

  /** Visual-arrangement overlaps (never a capacity verdict — see docs). */
  protected readonly overlappingIds = computed(() => findOverlappingPlots(this.layout().plots));
  /**
   * Aspect ratio of the rendered stage (width / height). The panel's shape is
   * a layout outcome, not a constant — wide on desktop, tall on mobile, the
   * viewport's own shape in fullscreen — so it is measured rather than
   * assumed. `null` until the observer reports, which keeps the first paint
   * identical to the world's own ratio.
   */
  private readonly viewportRatio = signal<number | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      // jsdom has no ResizeObserver; the null ratio then keeps the world's own
      // shape, which is exactly the pre-measurement behaviour the specs assert.
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.viewportRatio.set(width / height);
        }
      });
      observer.observe(this.mapSvg().nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /**
   * The camera's world box: the garden grown to the STAGE's aspect ratio and
   * centred on it.
   *
   * `preserveAspectRatio="meet"` letterboxes a viewBox whose shape differs
   * from its element. The world is a fixed 1.6 wide; on a 2.07-wide panel the
   * garden was pinned to ~46% of the width with dead lawn either side, and
   * every zoom level inherited that margin. Growing the box on the roomier
   * axis makes zoom 1 mean "this garden fills this panel", whatever shape the
   * panel happens to be.
   */
  private readonly world = computed(() => ({
    width: this.layout().width,
    height: this.layout().height,
  }));

  private readonly content = computed(() => {
    const { width, height } = this.world();
    const ratio = this.viewportRatio() ?? width / height;
    const wide = ratio >= width / height;
    const w = wide ? height * ratio : width;
    const h = wide ? height : width / ratio;
    return { width: w, height: h, x: (width - w) / 2, y: (height - h) / 2 };
  });
  protected readonly cornerR = computed(() => this.layout().width * 0.035);

  protected readonly plotViews = computed<readonly PlotView[]>(() => {
    const layout = this.layout();
    const plants = this.plants();
    const base = layout.width;
    const minVeg = base * 0.09;
    return layout.plots.map((p) => {
      const fontSize = Math.min(p.h * 0.16, base * 0.019);
      // Name-plate fitting (~0.68 em/glyph at weight 650): the pill NEVER
      // exceeds its bed; long names truncate. Area lives in the tooltip,
      // inspector and table — the map stays imagery-first (§14).
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
        rx: Math.min(p.w, p.h) * 0.14,
        fontSize,
        showLabel,
        aria: `${p.label}, ${p.requiredArea} square meters, ${Math.round(p.share * 100)} percent of the garden. Drag to reposition.`,
        humidityDelta,
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
   * Free-strip annotation (§6): make the remaining capacity explicit on the
   * map. Wide strip → horizontal label; narrow → vertical; sliver → a small
   * "+" marker so 0.5 m² is visible without pretending to be half the garden.
   */
  protected readonly freeHint = computed<{
    kind: 'label' | 'label-vertical' | 'marker';
    cx: number;
    cy: number;
    fs: number;
  } | null>(() => {
    const layout = this.layout();
    const band = layout.freeBand;
    if (!band || this.plants().length === 0) {
      return null; // empty garden keeps its dedicated "planting zone" hints
    }
    const cx = band.x + band.w / 2;
    const cy = band.y + band.h / 2;
    const fs = Math.min(layout.width * 0.019, band.h * 0.12);
    if (band.w >= layout.width * 0.24) {
      return { kind: 'label', cx, cy, fs };
    }
    if (band.w >= layout.width * 0.055) {
      return { kind: 'label-vertical', cx, cy, fs: Math.min(fs, band.w * 0.5) };
    }
    return { kind: 'marker', cx, cy, fs: Math.max(band.w * 0.42, layout.width * 0.008) };
  });

  /** Dashed "planting zone" hints, only when the garden is truly empty. */
  protected readonly emptyZones = computed(() => {
    const band = this.layout().freeBand;
    if (!band || this.plants().length > 0) {
      return [];
    }
    const r = Math.min(band.h / 2, band.w / 8) * 0.72;
    return [0.24, 0.5, 0.76].map((f) => ({
      cx: band.x + band.w * f,
      cy: band.y + band.h / 2,
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
      `Pan with arrow keys, zoom with plus and minus.`,
  );

  // ── Camera (resets whenever the surface dimensions change) ───────────────
  // Sourced from the WORLD, not the viewport-shaped box: resizing the window
  // must not snap a zoomed-in gardener back to fit. Both share a centre, so
  // the reset lands in the same place either way.
  private readonly camera = linkedSignal<CameraState>(() => fitCamera(this.world()));
  protected readonly viewBox = computed(() => viewBoxOf(this.camera(), this.content()));
  protected readonly zoomPercent = computed(() => Math.round(this.camera().zoom * 100));
  protected readonly minZoom = MIN_ZOOM;
  protected readonly maxZoom = MAX_ZOOM;
  protected readonly zoom = computed(() => this.camera().zoom);
  /** Zoom-dependent detail (§38): area text joins the labels when zoomed in. */
  protected readonly detailZoom = computed(() => this.camera().zoom >= 1.35);

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
    const band = layout.freeBand;
    let w = Math.sqrt(area * 1.3);
    let h = area / w;
    const maxW = (band?.w ?? layout.width * 0.9) * 0.9;
    const maxH = (band?.h ?? layout.height * 0.4) * 0.9;
    if (w > maxW) {
      w = maxW;
      h = area / w;
    }
    if (h > maxH) {
      h = maxH;
      w = Math.min(area / h, maxW);
    }
    const cx = band ? band.x + band.w / 2 : layout.width / 2;
    const cy = band ? band.y + band.h / 2 : layout.height * 0.72;
    return { x: cx - w / 2, y: cy - h / 2, w, h, rx: Math.min(w, h) * 0.14 };
  });

  // ── Selection & hover (shared with the plants table via model two-way) ───
  readonly selectedPlantId = model<number | null>(null);
  /** Deleted/absent plants can never stay "selected" — derived, not stored. */
  protected readonly selectedPlant = computed(
    () => this.plants().find((p) => p.plantId === this.selectedPlantId()) ?? null,
  );
  protected readonly selectedShare = computed(() => {
    const plant = this.selectedPlant();
    const total = this.garden().totalSurfaceArea;
    return plant && total > 0 ? (plant.surfaceAreaRequired / total) * 100 : 0;
  });
  protected readonly selectedPlantMutating = computed(() => {
    const id = this.selectedPlantId();
    return id !== null && this.mutatingIds().has(id);
  });

  protected readonly selectedHumidityDelta = computed(() => {
    const plant = this.selectedPlant();
    return plant ? plantHumidityDelta(this.garden(), plant) : 0;
  });

  protected readonly tooltip = signal<TooltipView | null>(null);

  /** Halo strength tracks the configured target — a hint, not a measurement. */
  protected readonly humidityHaloOpacity = computed(
    () => (this.garden().targetHumidityLevel / 100) * 0.35,
  );

  // ── Gestures (renderer-local plain fields — not application state) ───────
  // Pointer mode machine (§32): pointerdown on a plot arms a DRAG_PLANT
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
      // the honest footprint area never changes).
      const current = this.dragOverride() ?? {
        ...candidate,
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

    const drag = this.dragOverride();
    if (drag) {
      // Drop: snap the clamped rendered position to the m² grid rhythm, then
      // persist that — applyPositions re-clamps the snapped value on render.
      const plot = this.layout().plots.find((p) => p.plantId === drag.plantId);
      if (plot) {
        const snapped = snapPosition({ x: plot.x, y: plot.y });
        this.positionChange.emit({ plantId: drag.plantId, ...snapped });
        this.selectedPlantId.set(drag.plantId);
      }
      this.dragOverride.set(null);
    }
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
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.camera.set(
      zoomBy(this.camera(), this.content(), factor, this.screenToMap(event.clientX, event.clientY)),
    );
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
   * Escape cascade: layers panel → fullscreen → selection. Bound on the map
   * shell (not the SVG) so it also works with focus inside the toolbar or the
   * layers panel — a keyboard user must be able to Escape out of the popover.
   */
  protected onEscape(): void {
    if (this.layersOpen()) {
      this.layersOpen.set(false);
      // Focus was likely inside the popover, which just left the DOM — hand it
      // to the stage so the next Escape (and arrows/zoom keys) keep working.
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
