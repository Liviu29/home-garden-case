import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WATERING_ZONES } from '../../../../domain/garden-planner/garden-planner';

/** Which of the map's layers are drawn — map-local UI state, never persisted. */
export interface LayerToggles {
  readonly labels: boolean;
  readonly footprints: boolean;
  readonly grid: boolean;
  readonly humidity: boolean;
  readonly zones: boolean;
  readonly freeSpace: boolean;
}

export type LayerKey = keyof LayerToggles;

/** The layers popover: honest toggles, and the key to the watering zones. */
@Component({
  selector: 'app-map-layers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map-layers-panel.html',
  styleUrl: './map-layers-panel.scss',
  host: { class: 'layers-panel', role: 'group', 'aria-label': 'Map layers' },
})
export class MapLayersPanel {
  readonly layers = input.required<LayerToggles>();
  readonly toggle = output<LayerKey>();

  protected readonly zoneLegend = WATERING_ZONES;
}
