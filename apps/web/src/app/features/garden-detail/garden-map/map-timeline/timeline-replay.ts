import { type Signal, computed, linkedSignal, signal } from '@angular/core';
import type { Garden, Plant } from '../../../../core/api/models';
import { usedSurfaceArea } from '../../../../domain/garden-insights/garden-insights';
import { plantedBy, plantingDays } from '../../../../domain/garden-planner/garden-planner';

/** One planting day per beat when the timeline replays the garden. */
export const TIMELINE_STEP_MS = 900;

const NO_IDS: ReadonlySet<number> = new Set();

export interface TimelineReplayDeps {
  readonly plants: Signal<readonly Plant[]>;
  readonly garden: Signal<Garden>;
  /** Polite narration for screen readers. */
  readonly announce: (message: string) => void;
  /** The gardener asked for stillness: open paused, they scrub at their own pace. */
  readonly prefersStillness: () => boolean;
}

/**
 * The planting timeline: the garden replayed day by day, from its first
 * planting to today. State and playback only — the map draws the beds a day
 * has not planted yet as outlines of the future; the toolbar and the
 * timeline strip are its controls.
 */
export class TimelineReplay {
  readonly open = signal(false);
  readonly days = computed(() => plantingDays(this.deps.plants()));
  /** Index into `days`; follows the plant set so it never points past the end. */
  readonly dayIndex = linkedSignal<readonly string[], number>({
    source: this.days,
    computation: (days, previous) =>
      Math.min(previous?.value ?? days.length - 1, Math.max(0, days.length - 1)),
  });
  readonly day = computed(() => (this.open() ? (this.days()[this.dayIndex()] ?? null) : null));
  /**
   * The day as a UTC instant, for the date pipe. A bare 'YYYY-MM-DD' is read
   * as LOCAL midnight, which the UTC-formatted label then showed as the day
   * before anywhere east of Greenwich.
   */
  readonly date = computed(() => {
    const day = this.day();
    return day ? `${day}T00:00:00.000Z` : null;
  });
  /** Beds not yet planted on the timeline's day — drawn as outlines of the future. */
  readonly futureIds = computed<ReadonlySet<number>>(() => {
    const day = this.day();
    if (!day) {
      return NO_IDS;
    }
    const plants = this.deps.plants();
    const planted = plantedBy(plants, day);
    return new Set(plants.filter((p) => !planted.has(p.plantId)).map((p) => p.plantId));
  });
  readonly stats = computed(() => {
    const future = this.futureIds();
    const plants = this.deps.plants();
    const planted = plants.filter((p) => !future.has(p.plantId));
    const total = this.deps.garden().totalSurfaceArea;
    return {
      count: planted.length,
      total: plants.length,
      pct: total > 0 ? Math.min(100, (usedSurfaceArea(planted) / total) * 100) : 0,
    };
  });
  readonly playing = signal(false);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: TimelineReplayDeps) {}

  /** Open on the first day and replay — the replay is the point of opening it. */
  start(): void {
    this.open.set(true);
    this.dayIndex.set(0);
    const days = this.days();
    this.deps.announce(
      $localize`Planting timeline: ${days.length}:dayCount: planting days. Showing the first, ${days[0]}:firstDay:.`,
    );
    if (!this.deps.prefersStillness()) {
      this.play();
    }
  }

  /** Back to today, and say so. */
  close(): void {
    this.hide();
    this.deps.announce($localize`Timeline closed. Showing the garden today.`);
  }

  /** Back to today, silently — another panel is taking the timeline's place. */
  hide(): void {
    this.pause();
    this.open.set(false);
  }

  togglePlayback(): void {
    if (this.playing()) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Scrubbing pauses the replay and jumps to that day. */
  scrub(dayIndex: number): void {
    this.pause();
    this.dayIndex.set(dayIndex);
  }

  destroy(): void {
    clearInterval(this.timer);
  }

  private play(): void {
    const last = this.days().length - 1;
    if (this.dayIndex() >= last) {
      this.dayIndex.set(0);
    }
    this.playing.set(true);
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const next = Math.min(this.dayIndex() + 1, this.days().length - 1);
      this.dayIndex.set(next);
      if (next >= this.days().length - 1) {
        this.pause();
      }
    }, TIMELINE_STEP_MS);
  }

  private pause(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.playing.set(false);
  }
}
