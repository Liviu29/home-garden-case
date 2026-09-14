import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  afterRenderEffect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { Chart as HighchartsChart, Options } from 'highcharts';
import { Logger } from '../../../core/logging/logger';
import { Skeleton } from '../skeleton/skeleton';
import { HighchartsLoader } from './highcharts-loader';

type ChartState = 'loading' | 'ready' | 'failed';

/**
 * One Highcharts chart, loaded on demand (ADR-008). The library arrives the
 * first time a chart renders; later option changes update the same instance
 * (no flicker, no leaked listeners), and the chart is destroyed with the
 * component. Presentational: options in, nothing out — point events are part
 * of the options a feature builds. The parent gives the host its height.
 */
@Component({
  selector: 'app-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  template: `
    <div #host class="chart__host"></div>
    @if (state() === 'loading') {
      <app-skeleton class="chart__cover" variant="rect" w="100%" h="100%" />
    } @else if (state() === 'failed') {
      <p class="chart__cover chart__fallback">{{ fallback() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
    }
    .chart__host {
      width: 100%;
      height: 100%;
    }
    .chart__cover {
      position: absolute;
      inset: 0;
    }
    .chart__fallback {
      display: grid;
      place-items: center;
      margin: 0;
      padding: var(--sp-4);
      text-align: center;
      color: var(--text-3);
      font-size: var(--fs-caption);
    }
  `,
})
export class Chart {
  readonly options = input.required<Options>();
  /** Shown instead of the chart if the library cannot be loaded. */
  readonly fallback = input($localize`This chart could not be loaded.`);

  private readonly loader = inject(HighchartsLoader);
  private readonly logger = inject(Logger);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  protected readonly state = signal<ChartState>('loading');
  private chart: HighchartsChart | null = null;
  private destroyed = false;

  constructor() {
    afterRenderEffect(() => {
      void this.render(this.options());
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.chart?.destroy();
      this.chart = null;
    });
  }

  private async render(options: Options): Promise<void> {
    try {
      const highcharts = await this.loader.load();
      if (this.destroyed) {
        return;
      }
      if (this.chart) {
        this.chart.update(options, true, true);
      } else {
        this.chart = highcharts.chart(this.host().nativeElement, options);
      }
      this.state.set('ready');
    } catch (err) {
      this.state.set('failed');
      this.logger.error('chart', 'The chart library could not be loaded.', err);
    }
  }
}
