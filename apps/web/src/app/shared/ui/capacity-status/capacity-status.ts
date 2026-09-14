import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Garden, Plant } from '../../../core/api/models';
import {
  type CapacityStatus,
  capacityStatus,
} from '../../../domain/garden-insights/garden-insights';
import { StatusBadge, type StatusTone } from '../status-badge/status-badge';

/** What the screens call each capacity status; the status itself is the domain's. */
export const CAPACITY_STATUS_LABEL: Readonly<Record<CapacityStatus, string>> = {
  healthy: $localize`Healthy capacity`,
  approaching: $localize`Approaching capacity`,
  'almost-full': $localize`Almost full`,
  full: $localize`Full`,
};

/** UI-only mapping from the domain capacity status to a presentation tone. */
export const CAPACITY_STATUS_TONE: Readonly<Record<CapacityStatus, StatusTone>> = {
  healthy: 'success',
  approaching: 'neutral',
  'almost-full': 'warning',
  full: 'critical',
};

/**
 * Domain wrapper: derives the garden's capacity status (single source in
 * garden-insights.ts) and renders it through the shared StatusBadge.
 */
@Component({
  selector: 'app-capacity-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusBadge],
  template: `<app-status-badge [tone]="tone()">{{ label() }}</app-status-badge>`,
})
export class CapacityStatusChip {
  readonly garden = input.required<Garden>();
  readonly plants = input.required<readonly Plant[]>();

  protected readonly status = computed(() => capacityStatus(this.garden(), this.plants()));
  protected readonly label = computed(() => CAPACITY_STATUS_LABEL[this.status()]);
  protected readonly tone = computed(() => CAPACITY_STATUS_TONE[this.status()]);
}
