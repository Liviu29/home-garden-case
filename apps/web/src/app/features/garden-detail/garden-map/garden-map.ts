import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
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
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import type { Garden, Plant } from '../../../core/api/models';
import { bedsCount, plantsCount } from '../../../core/i18n/plurals';
import {
  capacityStatus,
  freeSurfaceArea,
  occupancyRatio,
} from '../../../domain/garden-insights/garden-insights';
import {
  PLANNER_SNAP,
  applyPositions,
  clampPosition,
  computeGardenMapLayout,
  findOverlappingPlots,
  settleDrop,
} from '../../../domain/garden-map-layout/garden-map-layout';
import {
  arrangeByWateringZone,
  findWateringConflicts,
  largestFreeRect,
  zoneBreakdown,
} from '../../../domain/garden-planner/garden-planner';
import type { LayoutPositions } from '../../../state/garden-layout/garden-layout-repository';
import { WATERING_ZONE_LABEL } from '../../../shared/ui/watering-zone/watering-zone-labels';
import {
  type FreeHint,
  type MapBox,
  type PlotView,
  type StageSize,
  buildPlotViews,
  dimensionsFor,
  emptyZonesFor,
  frameContent,
  freeHintFor,
  ghostBedFor,
  sameBox,
  sameSize,
} from './garden-map-view';
import {
  type CameraState,
  ZOOM_STEP,
  cameraKey,
  clampCamera,
  fitCamera,
  focusOn,
  isFitted,
  panBy,
  pxPerUnit,
  screenToMap,
  viewBoxOf,
  zoomBy,
} from './map-camera/map-camera';
import { MapGestures } from './map-gestures/map-gestures';
import { MapHud } from './map-hud/map-hud';
import { MapInspector } from './map-inspector/map-inspector';
import {
  type LayerKey,
  type LayerToggles,
  MapLayersPanel,
} from './map-layers-panel/map-layers-panel';
import { MapPlanList, type PlanRow } from './map-plan-list/map-plan-list';
import { buildPlanRows } from './map-plan-list/plan-rows';
import { MapTimeline } from './map-timeline/map-timeline';
import { TimelineReplay } from './map-timeline/timeline-replay';
import { MapToolbar } from './map-toolbar/map-toolbar';

interface TooltipView {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly area: number;
  readonly sharePct: number;
}

/** Within this many screen px, a dropped bed's edge snaps to a fence, a bed edge or home. */
const EDGE_SNAP_PX = 12;

/** Arrow-key nudges (a keyboard alternative to dragging — WCAG 2.5.7). */
const ARROW_STEPS: Readonly<Record<string, { readonly x: number; readonly y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const snapToGrid = (value: number): number => Math.round(value / PLANNER_SNAP) * PLANNER_SNAP;

/** "1.25" — for spoken positions. */
const metres = (value: number): string => String(Math.round(value * 100) / 100);

const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

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
 * zones, neighbour clashes, "Group by water needs", a planting timeline and a
 * text version of the plan are all derived from the plants' real data.
 *
 * This component owns the scene, the camera and the planner state, and it
 * is the only place that touches the DOM. Around it: the pointer machine
 * (`MapGestures`) turns pointer samples into pan/pinch/drag intents, the
 * timeline (`TimelineReplay`) owns the replay's state and playback, the
 * camera and the screen↔map maths are pure (`map-camera.ts`), and the
 * geometry the scene draws comes from the pure builders in
 * `garden-map-view.ts`. The controls are presentational children — toolbar,
 * HUD, layers panel, timeline strip, plan list and inspector.
 *
 * Interaction state (camera, selection, hover, timeline) is component-local
 * signals; renderer-only animation is pure CSS gated by
 * `prefers-reduced-motion` — no signal writes per frame (zoneless).
 */
@Component({
  selector: 'app-garden-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MapHud,
    MapInspector,
    MapLayersPanel,
    MapPlanList,
    MapTimeline,
    MapToolbar,
  ],
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
  /** The plan as a list — the same beds as text, over the stage. */
  protected readonly listOpen = signal(false);
  /** The garden replayed day by day (state and playback; the map draws it). */
  protected readonly timeline = new TimelineReplay({
    plants: this.plants,
    garden: this.garden,
    announce: (message) => this.announce(message),
    prefersStillness: prefersReducedMotion,
  });

  protected toggleLayer(key: LayerKey): void {
    this.layers.set({ ...this.layers(), [key]: !this.layers()[key] });
  }

  protected toggleLayers(): void {
    this.layersOpen.set(!this.layersOpen());
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
    const future = this.timeline.futureIds();
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
      this.timeline.destroy();
    });
  }

  /** Garden surface size in map units — only changes with the garden's m². */
  private readonly world = computed(
    () => ({ width: this.layout().width, height: this.layout().height }),
    { equal: sameSize },
  );

  /** The camera's world box — what zoom 1 ("Fit") shows (see `frameContent`). */
  protected readonly content = computed<MapBox>(
    () => frameContent(this.world(), this.stageSize()),
    { equal: sameBox },
  );

  /** Lawn corner radius — small enough that a bed in a corner stays inside the fence. */
  protected readonly cornerR = computed(() => this.layout().width * 0.03);
  /** The fence runs just OUTSIDE the planting surface, so edge beds sit inside it. */
  protected readonly fenceGap = computed(() => this.layout().width * 0.014);

  protected readonly plotViews = computed<readonly PlotView[]>(() =>
    buildPlotViews(this.layout(), this.plants(), this.garden()),
  );

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
   * The free-soil annotation (`freeHintFor`). Hidden mid-drag (the ground is
   * changing under the cursor) and while the timeline replays the past.
   */
  protected readonly freeHint = computed<FreeHint | null>(() => {
    const spot = this.freeSpot();
    if (!spot || this.plants().length === 0 || this.draggingPlant() || this.timeline.open()) {
      return null; // an empty garden keeps its dedicated "planting zone" hints
    }
    return freeHintFor(this.layout(), spot);
  });

  /** Dashed "planting zone" hints, only when the garden is truly empty. */
  protected readonly emptyZones = computed(() => {
    const spot = this.freeSpot();
    return !spot || this.plants().length > 0 ? [] : emptyZonesFor(spot);
  });

  // ── HUD (delegates to the shared domain math — never re-implemented) ─────
  protected readonly freeArea = computed(() => freeSurfaceArea(this.garden(), this.plants()));
  protected readonly utilizationPct = computed(() =>
    Math.min(100, occupancyRatio(this.garden(), this.plants()) * 100),
  );
  protected readonly status = computed(() => capacityStatus(this.garden(), this.plants()));

  protected readonly mapAria = computed(() => {
    const { gardenName, totalSurfaceArea, targetHumidityLevel } = this.garden();
    const plantCount = this.plants().length;
    const usedPct = Math.round(this.utilizationPct());
    return $localize`Map of ${gardenName}:gardenName:: ${plantsCount(plantCount)}:plants:, ${usedPct}:usedPct: percent of ${totalSurfaceArea}:surfaceArea: square meters used, target humidity ${targetHumidityLevel}:targetHumidity: percent. Pan with arrow keys, zoom with plus and minus. Focus a bed to move it with its arrow keys.`;
  });

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
  protected readonly zoom = computed(() => this.camera().zoom);
  /** Zoom-dependent detail: area text joins the labels when zoomed in. */
  protected readonly detailZoom = computed(() => this.camera().zoom >= 1.35);

  /** Screen px per map unit at the current view — null until the stage is measured. */
  private readonly unitPx = computed(() => {
    const stage = this.stageSize();
    return stage ? pxPerUnit(stage, this.content(), this.camera()) : null;
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
    return area === null || area <= 0 ? null : ghostBedFor(area, this.layout(), this.freeSpot());
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
        text: at.home
          ? $localize`Back to its auto spot`
          : $localize`x ${metres(at.x)}:x: m · y ${metres(at.y)}:y: m`,
      },
    };
  });

  /** Dimension lines for the bed in hand (dragged, else selected). */
  protected readonly dimensions = computed(() => {
    const id = this.draggingId() ?? this.selectedPlantId();
    const plot = this.plotViews().find((p) => p.plantId === id);
    if (!plot || this.mutatingIds().has(plot.plantId)) {
      return null;
    }
    return dimensionsFor(plot, this.layout().width);
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
      this.announce($localize`Not enough open ground to regroup these beds without overlaps.`);
      return;
    }
    this.arrangeBlocked.set(false);
    this.arrangePositions.emit(next);
    this.showZones(); // the grouping only makes sense with the zones in view
    const summary = zoneBreakdown(this.plants())
      .filter((z) => z.plants > 0)
      .map((z) => $localize`${z.plants}:count: ${WATERING_ZONE_LABEL[z.zone].toLowerCase()}:zone:`)
      .join(', ');
    this.announce(
      $localize`Beds regrouped by water needs, driest first: ${summary}:summary:. Undo restores your plan.`,
    );
  }

  protected returnHome(plantId: number): void {
    this.resetPosition.emit(plantId);
    const name = this.plants().find((p) => p.plantId === plantId)?.plantName ?? $localize`The bed`;
    this.announce($localize`${name}:plantName: returned to its automatic spot.`);
  }

  // ── The plan as a list ────────────────────────────────────────────────────
  /** Every bed of the current arrangement in words, in reading order. */
  protected readonly planRows = computed<readonly PlanRow[]>(() => {
    const humidity = this.humidityById();
    return buildPlanRows(
      this.layout().plots,
      (id) => humidity.get(id),
      this.garden().targetHumidityLevel,
      this.positions(),
    );
  });

  protected toggleList(): void {
    const open = !this.listOpen();
    this.listOpen.set(open);
    if (!open) {
      this.announce($localize`Showing the plan.`);
      return;
    }
    this.layersOpen.set(false);
    this.timeline.hide(); // the list covers the plan the replay is drawn on
    const bedCount = this.plants().length;
    this.announce($localize`Showing the plan as a list of ${bedsCount(bedCount)}:beds:.`);
  }

  // ── Planting timeline ─────────────────────────────────────────────────────
  protected toggleTimeline(): void {
    if (this.timeline.open()) {
      this.timeline.close();
      return;
    }
    this.layersOpen.set(false);
    this.listOpen.set(false); // the replay is drawn on the plan the list would cover
    this.timeline.start();
  }

  // ── Gestures ──────────────────────────────────────────────────────────────
  // The pointer machine (renderer-local, not application state) says what a
  // gesture means — pinch, pan or a bed drag; this component applies it.
  private readonly gestures = new MapGestures();

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
    if (this.gestures.wasTap) {
      this.selectPlant(plantId);
    }
  }

  /** Arms a bed drag; the svg pointerdown still runs after this. */
  protected onPlotPointerDown(plantId: number): void {
    if (!this.mutatingIds().has(plantId)) {
      this.gestures.armBed(plantId);
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
      this.announce($localize`${plot.fullLabel}:plantName: is already against the fence.`);
      return;
    }
    this.positionChange.emit({ plantId: plot.plantId, x: next.x, y: next.y });
    this.announce(
      $localize`${plot.fullLabel}:plantName: moved to ${metres(next.x)}:x: by ${metres(next.y)}:y: metres.`,
    );
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
    if (this.gestures.down(event)) {
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
    const intent = this.gestures.move(event);
    if (!intent) {
      return;
    }
    if (intent.kind === 'pinch') {
      const { x, y } = intent.midpoint;
      this.camera.set(zoomBy(this.camera(), this.content(), intent.factor, this.toMap(x, y)));
      return;
    }
    this.capture(event); // keep the gesture even off-element
    this.tooltip.set(null);
    const scale = this.scale();
    if (scale === 0) {
      return;
    }
    if (intent.kind === 'drag') {
      // Move the bed, not the camera (visual placement only — the honest
      // footprint area never changes). The override tracks the raw pointer;
      // rendering clamps it inside the garden, and the bed stays under the
      // same point of the cursor it was grabbed by.
      const current =
        this.dragOverride() ?? this.layout().plots.find((p) => p.plantId === intent.plantId);
      if (current) {
        this.dragOverride.set({
          plantId: intent.plantId,
          x: current.x + intent.dxPx / scale,
          y: current.y + intent.dyPx / scale,
        });
      }
      return;
    }
    this.camera.set(
      panBy(this.camera(), this.content(), -intent.dxPx / scale, -intent.dyPx / scale),
    );
  }

  protected onPointerUp(event: PointerEvent): void {
    this.gestures.up(event);

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
      zoomBy(this.camera(), this.content(), factor, this.toMap(event.clientX, event.clientY)),
    );
  }

  private flashWheelHint(): void {
    this.wheelHint.set(true);
    clearTimeout(this.wheelHintTimer);
    this.wheelHintTimer = setTimeout(() => this.wheelHint.set(false), 1400);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const next = cameraKey(event.key, this.camera(), this.content());
    if (next) {
      this.camera.set(next);
      event.preventDefault();
    }
  }

  /**
   * Escape cascade: layers panel → timeline → plan list → fullscreen →
   * selection. Bound on the map shell (not the SVG) so it also works with
   * focus inside the toolbar, a popover or the list — a keyboard user must be
   * able to Escape out.
   */
  protected onEscape(): void {
    if (this.layersOpen()) {
      this.layersOpen.set(false);
      // Focus was likely inside the popover, which just left the DOM — hand it
      // to the stage so the next Escape (and arrows/zoom keys) keep working.
      this.mapSvg().nativeElement.focus();
    } else if (this.timeline.open()) {
      this.timeline.close();
      this.mapSvg().nativeElement.focus();
    } else if (this.listOpen()) {
      this.toggleList();
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
    if (this.gestures.idle) {
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

  // ── Screen ↔ map units (pure maths in map-camera, fed the live stage rect) ─
  private stageRect(): DOMRect {
    return this.mapSvg().nativeElement.getBoundingClientRect();
  }

  private scale(): number {
    return pxPerUnit(this.stageRect(), this.content(), this.camera());
  }

  private toMap(clientX: number, clientY: number): { x: number; y: number } {
    return screenToMap(this.stageRect(), this.content(), this.camera(), clientX, clientY);
  }
}
