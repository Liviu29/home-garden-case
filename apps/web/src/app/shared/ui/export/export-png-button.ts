import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ToastStore } from '../../../core/errors/toast-store';
import { Logger } from '../../../core/logging/logger';
import { SvgExporter } from './svg-export';

/**
 * "Save as PNG" for whatever SVG sits inside `target`: a chart or the
 * garden planner. The file is drawn and saved in the browser.
 */
@Component({
  selector: 'app-export-png-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  template: `
    <button
      matButton
      type="button"
      class="export press-feedback"
      [disabled]="busy()"
      [attr.aria-label]="saveLabel()"
      (click)="save()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 4 V15 M7.5 10.5 L12 15 L16.5 10.5 M5 19 H19"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      PNG
    </button>
  `,
  styles: `
    /* Never squeezed by a long title beside it: the icon and label stay on one line */
    :host {
      flex: none;
    }
    .export {
      font-size: var(--fs-caption);
      white-space: nowrap;
    }
    svg {
      width: 1rem;
      height: 1rem;
      margin-inline-end: var(--sp-1);
    }
  `,
})
export class ExportPngButton {
  /** The element that holds the SVG to save. */
  readonly target = input.required<HTMLElement>();
  /** Which SVG inside `target` — a panel can hold icons before the drawing. */
  readonly selector = input('svg');
  /** What is being saved — the file name and the button's label come from it. */
  readonly title = input.required<string>();

  private readonly exporter = inject(SvgExporter);
  private readonly toasts = inject(ToastStore);
  private readonly logger = inject(Logger);
  protected readonly busy = signal(false);
  protected readonly saveLabel = computed(() => $localize`Save ${this.title()}:title: as PNG`);

  protected async save(): Promise<void> {
    const svg = this.target().querySelector<SVGSVGElement>(this.selector());
    if (!svg) {
      this.toasts.info($localize`Nothing to save yet — wait for it to finish drawing.`);
      return;
    }
    this.busy.set(true);
    try {
      await this.exporter.downloadPng(svg, this.title());
    } catch (err) {
      this.toasts.error($localize`Couldn't save “${this.title()}:title:” as an image.`);
      this.logger.warn('export:png', err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
