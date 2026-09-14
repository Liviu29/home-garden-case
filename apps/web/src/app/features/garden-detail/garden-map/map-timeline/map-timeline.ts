import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

/**
 * The planting timeline's controls: play/pause, a day scrubber and a readout
 * of what was in the ground that day. The map owns the day and the playback;
 * this component shows them and reports what the gardener does.
 */
@Component({
  selector: 'app-map-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './map-timeline.html',
  styleUrl: './map-timeline.scss',
  // Host attributes cannot carry i18n, so the label is bound from a $localize string.
  host: { class: 'map-timeline', role: 'group', '[attr.aria-label]': 'hostLabel' },
})
export class MapTimeline {
  protected readonly hostLabel = $localize`Planting timeline`;

  readonly dayCount = input.required<number>();
  readonly dayIndex = input.required<number>();
  /** The day on show as a UTC instant, for the date pipe. */
  readonly date = input<string | null>(null);
  readonly planted = input.required<number>();
  readonly total = input.required<number>();
  /** Share of the garden's surface in use on that day, in %. */
  readonly usedPct = input.required<number>();
  readonly playing = input(false);

  readonly togglePlayback = output<void>();
  readonly scrub = output<number>();
  readonly dismiss = output<void>();

  protected readonly playbackLabel = computed(() =>
    this.playing() ? $localize`Pause timeline` : $localize`Play timeline`,
  );

  protected onInput(event: Event): void {
    this.scrub.emit(Number((event.target as HTMLInputElement).value));
  }
}
