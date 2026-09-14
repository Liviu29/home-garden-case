import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { CapacityStatus } from '../../../../domain/garden-insights/garden-insights';
import { CAPACITY_STATUS_LABEL } from '../../../../shared/ui/capacity-status/capacity-status';

/**
 * The capacity HUD: one glass panel in the stage's bottom band. Every number
 * arrives computed by the shared domain functions — the HUD only lays them out.
 */
@Component({
  selector: 'app-map-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './map-hud.html',
  styleUrl: './map-hud.scss',
  host: { class: 'map-hud', '[class.hud-muted]': 'muted()' },
})
export class MapHud {
  readonly utilizationPct = input.required<number>();
  readonly freeArea = input.required<number>();
  readonly targetHumidity = input.required<number>();
  readonly status = input.required<CapacityStatus>();
  /** Fades while a bed is dragged, so the HUD never hides the drop zone. */
  readonly muted = input(false);

  protected readonly statusLabel = computed(() => CAPACITY_STATUS_LABEL[this.status()]);
}
