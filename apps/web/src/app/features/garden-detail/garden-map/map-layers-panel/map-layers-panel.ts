import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WATERING_ZONE_LEGEND } from '../../../../shared/ui/watering-zone/watering-zone-labels';

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
  // Host attributes cannot carry i18n, so the label is bound from a $localize string.
  host: { class: 'layers-panel', role: 'group', '[attr.aria-label]': 'hostLabel' },
})
export class MapLayersPanel {
  readonly layers = input.required<LayerToggles>();
  readonly toggleLayer = output<LayerKey>();

  protected readonly hostLabel = $localize`Map layers`;

  protected readonly zoneLegend = WATERING_ZONE_LEGEND;
}
