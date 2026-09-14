import { signal } from '@angular/core';
import type { Garden, Plant } from '../../../../core/api/models';
import { TIMELINE_STEP_MS, TimelineReplay } from './timeline-replay';

const garden: Garden = {
  gardenId: 1,
  gardenName: 'Sunny Backyard',
  totalSurfaceArea: 20,
  targetHumidityLevel: 60,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

const plant = (plantId: number, plantationDate: string, surfaceAreaRequired = 5): Plant => ({
  plantId,
  plantName: `Plant ${plantId}`,
  species: 'Species',
  plantType: 'vegetable',
  plantationDate,
  surfaceAreaRequired,
  idealHumidityLevel: 55,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

describe('TimelineReplay (the garden replayed day by day)', () => {
  const plants = signal<readonly Plant[]>([
    plant(1, '2026-04-01T00:00:00.000Z'),
    plant(2, '2026-04-05T00:00:00.000Z'),
    plant(3, '2026-04-09T00:00:00.000Z', 10),
  ]);
  let announced: string[];
  let stillness: boolean;
  let replay: TimelineReplay;

  beforeEach(() => {
    vi.useFakeTimers();
    announced = [];
    stillness = false;
    replay = new TimelineReplay({
      plants,
      garden: signal(garden),
      announce: (m) => announced.push(m),
      prefersStillness: () => stillness,
    });
  });

  afterEach(() => {
    replay.destroy();
    vi.useRealTimers();
  });

  it('closed, it shows today: no day, nothing in the future', () => {
    expect(replay.open()).toBe(false);
    expect(replay.days()).toEqual(['2026-04-01', '2026-04-05', '2026-04-09']);
    expect(replay.day()).toBeNull();
    expect(replay.date()).toBeNull();
    expect(replay.futureIds().size).toBe(0);
  });

  it('starts on the first day, says so, and replays one day per beat until today', () => {
    replay.start();
    expect(replay.open()).toBe(true);
    expect(replay.dayIndex()).toBe(0);
    expect(replay.playing()).toBe(true);
    expect(announced.at(-1)).toContain('3 planting days');
    expect(announced.at(-1)).toContain('2026-04-01');
    // Day one: one bed in the ground, two still to come; 5 of 20 m² used.
    expect(replay.date()).toBe('2026-04-01T00:00:00.000Z');
    expect([...replay.futureIds()]).toEqual([2, 3]);
    expect(replay.stats()).toEqual({ count: 1, total: 3, pct: 25 });

    vi.advanceTimersByTime(TIMELINE_STEP_MS);
    expect(replay.dayIndex()).toBe(1);
    expect(replay.playing()).toBe(true);
    vi.advanceTimersByTime(TIMELINE_STEP_MS);
    expect(replay.dayIndex()).toBe(2);
    expect(replay.playing()).toBe(false); // stopped on today
    expect(replay.futureIds().size).toBe(0);
    expect(replay.stats()).toEqual({ count: 3, total: 3, pct: 100 });
  });

  it('play from the end restarts at the first day; pause stops the beat', () => {
    replay.start();
    vi.advanceTimersByTime(TIMELINE_STEP_MS * 2);
    expect(replay.dayIndex()).toBe(2);
    replay.togglePlayback();
    expect(replay.dayIndex()).toBe(0);
    expect(replay.playing()).toBe(true);
    replay.togglePlayback();
    expect(replay.playing()).toBe(false);
    vi.advanceTimersByTime(TIMELINE_STEP_MS * 3);
    expect(replay.dayIndex()).toBe(0);
  });

  it('scrubbing pauses and jumps to that day', () => {
    replay.start();
    replay.scrub(1);
    expect(replay.playing()).toBe(false);
    expect(replay.day()).toBe('2026-04-05');
    vi.advanceTimersByTime(TIMELINE_STEP_MS * 3);
    expect(replay.dayIndex()).toBe(1);
  });

  it('under reduced motion it opens paused on the first day', () => {
    stillness = true;
    replay.start();
    expect(replay.open()).toBe(true);
    expect(replay.playing()).toBe(false);
  });

  it('close returns to today and says so; hide does it silently', () => {
    replay.start();
    replay.close();
    expect(replay.open()).toBe(false);
    expect(replay.playing()).toBe(false);
    expect(announced.at(-1)).toContain('Timeline closed');

    replay.start();
    const before = announced.length;
    replay.hide();
    expect(replay.open()).toBe(false);
    expect(announced.length).toBe(before);
  });

  it('the day index follows the plant set, never past the end', () => {
    replay.start();
    replay.scrub(2);
    plants.set([plant(1, '2026-04-01T00:00:00.000Z')]);
    expect(replay.dayIndex()).toBe(0);
    plants.set([
      plant(1, '2026-04-01T00:00:00.000Z'),
      plant(2, '2026-04-05T00:00:00.000Z'),
      plant(3, '2026-04-09T00:00:00.000Z', 10),
    ]);
  });
});
