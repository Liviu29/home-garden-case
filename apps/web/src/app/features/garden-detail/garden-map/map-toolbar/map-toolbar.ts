import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MAX_ZOOM, MIN_ZOOM } from '../map-camera/map-camera';

/**
 * The planner's view controls: zoom, fit, undo/redo of layout moves, the
 * planting timeline, layers, the plan as a list, and fullscreen. It owns no
 * state — the map passes in what to show and handles every intent.
 */
@Component({
  selector: 'app-map-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map-toolbar.html',
  styleUrl: './map-toolbar.scss',
  host: { class: 'map-toolbar', role: 'toolbar', 'aria-label': 'Map view controls' },
})
export class MapToolbar {
  readonly zoom = input.required<number>();
  readonly canUndo = input(false);
  readonly canRedo = input(false);
  readonly hasCustomLayout = input(false);
  /** The timeline needs plants from at least two different planting days. */
  readonly canReplay = input(false);
  readonly timelineOpen = input(false);
  readonly layersOpen = input(false);
  readonly listOpen = input(false);
  readonly isFullscreen = input(false);

  readonly zoomIn = output<void>();
  readonly zoomOut = output<void>();
  readonly fit = output<void>();
  readonly resetView = output<void>();
  readonly undo = output<void>();
  readonly redo = output<void>();
  readonly resetLayout = output<void>();
  readonly toggleTimeline = output<void>();
  readonly toggleLayers = output<void>();
  readonly toggleList = output<void>();
  readonly toggleFullscreen = output<void>();

  protected readonly minZoom = MIN_ZOOM;
  protected readonly maxZoom = MAX_ZOOM;
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  protected readonly timelineLabel = computed(() =>
    this.canReplay() ? 'Planting timeline' : 'Planting timeline — needs plants from different days',
  );
}
