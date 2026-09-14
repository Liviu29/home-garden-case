import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { WateringRound } from '../../../domain/watering-plan/watering-plan';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { WATERING_ZONE_LABEL } from '../../../shared/ui/watering-zone/watering-zone-labels';

/**
 * "Water today" on the dashboard: the gardens with something to water,
 * split by watering zone (domain/watering-plan), and when the rest are next.
 */
@Component({
  selector: 'app-watering-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, Skeleton],
  templateUrl: './watering-panel.html',
  styleUrl: './watering-panel.scss',
})
export class WateringPanel {
  readonly round = input.required<WateringRound>();
  protected readonly zoneLabel = WATERING_ZONE_LABEL;
  /** False while plants are still arriving: ghosts, never a partial plan. */
  readonly settled = input.required<boolean>();

  protected when(days: number | null): string {
    return days === 1 ? $localize`tomorrow` : $localize`in ${days}:days: days`;
  }
}
