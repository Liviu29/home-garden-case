import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { APP_CONFIG } from '../../../core/config/app-config';

/**
 * Skeleton timing wrapper (DESIGN-SYSTEM §4):
 * - appears only after a short delay → no flash on instant cache hits
 * - once visible, stays a minimum time → no blink when data lands quickly
 *
 * Usage:
 * ```html
 * <app-skeleton-group [loading]="store.isLoading()">
 *   <ng-content-projected-skeletons slot="ghost" />
 *   real content
 * </app-skeleton-group>
 * ```
 */
@Component({
  selector: 'app-skeleton-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showGhost()) {
      <div class="ghost-slot" role="status" aria-live="polite">
        <span class="visually-hidden">Loading…</span>
        <ng-content select="[ghost]" />
      </div>
    } @else {
      <ng-content />
    }
  `,
})
export class SkeletonGroup {
  private readonly config = inject(APP_CONFIG);

  readonly loading = input.required<boolean>();

  private readonly delayedVisible = signal(false);
  private shownAt = 0;

  protected readonly showGhost = computed(() => this.delayedVisible());

  constructor() {
    let appearTimer: ReturnType<typeof setTimeout> | undefined;
    let minTimer: ReturnType<typeof setTimeout> | undefined;

    effect(() => {
      const isLoading = this.loading();
      clearTimeout(appearTimer);
      clearTimeout(minTimer);

      if (isLoading) {
        appearTimer = setTimeout(() => {
          this.shownAt = Date.now();
          this.delayedVisible.set(true);
        }, this.config.skeleton.appearDelayMs);
      } else if (this.delayedVisible()) {
        const shownFor = Date.now() - this.shownAt;
        const remaining = Math.max(0, this.config.skeleton.minDisplayMs - shownFor);
        minTimer = setTimeout(() => this.delayedVisible.set(false), remaining);
      } else {
        this.delayedVisible.set(false);
      }
    });
  }
}
