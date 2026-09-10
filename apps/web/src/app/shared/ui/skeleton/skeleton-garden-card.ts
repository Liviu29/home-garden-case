import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Skeleton } from './skeleton';

/**
 * Ghost composition for a garden card (REM-014) — the one ghost layout used
 * from more than one place. Shape only: shimmer, timing and a11y come from
 * the shared primitives (DESIGN-SYSTEM §4); other, single-use ghost layouts
 * deliberately stay inline next to the template they mirror.
 */
@Component({
  selector: 'app-skeleton-garden-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  template: `
    <div class="ghost-card">
      <app-skeleton variant="title" w="55%" />
      <app-skeleton variant="line" w="40%" />
      <app-skeleton variant="rect" h="2.5rem" />
      <app-skeleton variant="line" w="70%" />
    </div>
  `,
  styles: `
    .ghost-card {
      display: grid;
      gap: var(--sp-3);
      padding: var(--sp-6);
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius-l);
      box-shadow: var(--shadow-1);
    }
  `,
})
export class SkeletonGardenCard {}
