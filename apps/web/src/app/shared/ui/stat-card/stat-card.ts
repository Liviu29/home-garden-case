import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Skeleton } from '../skeleton/skeleton';

/**
 * Dashboard stat tile (DESIGN-SYSTEM §5/6): value, label, optional context
 * line and a quiet progress strip. The number renders as-is — the tile enters
 * with its grid's stagger, and the strip grows in on first paint (CSS). (A
 * rAF count-up used to rewrite a signal every frame for 600ms per tile;
 * decoration that cost change detection and showed wrong numbers mid-flight.)
 */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  template: `
    <div class="card lift-hover">
      <span class="icon" aria-hidden="true"><ng-content select="[icon]" /></span>
      @if (valuePending()) {
        <!-- The number is derived from data still arriving: hold its exact
             line box rather than show a partial total that later jumps -->
        <span class="value value-ghost" aria-hidden="true">
          <app-skeleton class="skeleton-appear" variant="title" w="3.5rem" h="0.8em" />
        </span>
      } @else {
        <span class="value tabular">{{ value() }}{{ suffix() }}</span>
      }
      <span class="label">{{ label() }}</span>
      @if (pending()) {
        <!-- Holds the context line's exact line box while its data loads -->
        <span class="context context-ghost" aria-hidden="true">
          <app-skeleton class="skeleton-appear" variant="line" w="70%" h="0.7rem" />
        </span>
      } @else if (context()) {
        <span class="context">{{ context() }}</span>
      }
      @if (progress() !== null) {
        <span
          class="strip"
          role="progressbar"
          [attr.aria-label]="progressLabel()"
          [attr.aria-valuenow]="progressPct()"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span
            class="strip-fill"
            [class.warn]="progressWarn()"
            [style.transform]="'scaleX(' + progressPct() / 100 + ')'"
          ></span>
        </span>
      }
    </div>
  `,
  styles: `
    // A grid host lets the card fill its grid row: every tile in a row is the
    // same height (as their ghosts are), instead of three short and one tall.
    :host {
      display: grid;
    }

    .card {
      display: grid;
      align-content: start;
      gap: var(--sp-1);
      padding: var(--sp-6);
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius-l);
      box-shadow: var(--shadow-1);
    }

    .icon {
      width: 2.25rem;
      height: 2.25rem;
      display: grid;
      place-items: center;
      border-radius: var(--radius-m);
      background: var(--brand-soft);
      color: var(--brand-600);
      margin-bottom: var(--sp-2);
    }

    .value {
      font-family: var(--font-display);
      font-size: var(--fs-display);
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    // One value line box, exactly — the ghost and the number share it.
    .value-ghost {
      display: grid;
      align-items: center;
      height: 1lh;
    }

    .label {
      color: var(--text-2);
      font-size: var(--fs-caption);
    }

    .context {
      color: var(--text-3);
      font-size: var(--fs-caption);
      margin-top: var(--sp-1);
    }

    // Grid, not flex: a flex item shrinks to its content, and a
    // percentage-wide skeleton has none — the ghost reserved its line but
    // painted nothing.
    .context-ghost {
      display: grid;
      align-items: center;
      height: 1lh;
    }

    // Tiny progress strip — a quiet visual accent, not a chart
    .strip {
      display: block;
      height: 0.3rem;
      border-radius: var(--radius-pill);
      background: var(--surface-2);
      overflow: hidden;
      margin-top: var(--sp-2);
    }

    // transform, not width: the fill grows without re-laying out the tile.
    .strip-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--gradient-brand);
      transform-origin: left center;
      transition: transform var(--dur-slow) var(--ease-out);

      @starting-style {
        transform: scaleX(0) !important;
      }

      &.warn {
        background: var(--accent-amber);
      }
    }
  `,
})
export class StatCard {
  readonly value = input.required<number>();
  readonly label = input.required<string>();
  readonly suffix = input('');
  /** Small secondary context line (e.g. "2 healthy · 1 needs attention"). */
  readonly context = input('');
  /** The context line's data is still loading: reserve its line with a ghost. */
  readonly pending = input(false);
  /**
   * The value itself is still loading (e.g. a total over plant lists that are
   * still arriving): ghost it, never show a partial number that later jumps.
   */
  readonly valuePending = input(false);
  /** 0..1 renders a quiet progress strip; null (default) renders none. */
  readonly progress = input<number | null>(null);
  readonly progressWarn = input(false);

  protected readonly progressPct = computed(() =>
    Math.round(Math.min(1, Math.max(0, this.progress() ?? 0)) * 100),
  );

  protected readonly progressLabel = computed(() => $localize`${this.label()}:label: progress`);
}
