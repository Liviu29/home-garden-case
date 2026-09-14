import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/** One bed of the plan, in words: where it is, how big, how it is watered, what is next to it. */
export interface PlanRow {
  readonly plantId: number;
  readonly name: string;
  /** Metres from the garden's left edge and top edge to the bed's corner. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly depth: number;
  readonly area: number;
  readonly zone: string;
  /** The gardener placed it, rather than the automatic layout. */
  readonly placed: boolean;
  readonly neighbours: readonly string[];
}

/**
 * The plan as a list — the same garden the SVG draws, as a table a screen
 * reader (or anyone who prefers text) can read row by row: each bed's
 * position, size, watering zone and neighbours. Choosing a bed selects it on
 * the plan and in the inspector.
 */
@Component({
  selector: 'app-map-plan-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './map-plan-list.html',
  styleUrl: './map-plan-list.scss',
  // Host attributes cannot carry i18n, so the label is bound from a $localize string.
  host: { class: 'plan-list', role: 'region', '[attr.aria-label]': 'hostLabel' },
})
export class MapPlanList {
  readonly rows = input.required<readonly PlanRow[]>();
  readonly selectedPlantId = input<number | null>(null);
  readonly selectPlant = output<number>();

  protected readonly hostLabel = $localize`Plan as a list`;
}
