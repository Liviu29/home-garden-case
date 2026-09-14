import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Garden } from '../../../core/api/models';
import {
  type WateringPlan,
  type WateringRound,
  wateringPlan,
} from '../../../domain/watering-plan/watering-plan';
import { WateringPanel } from './watering-panel';

const TODAY = '2026-09-11';

const garden = (id: number, name: string): Garden => ({
  gardenId: id,
  gardenName: name,
  totalSurfaceArea: 20,
  targetHumidityLevel: 50,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
});

const bed = (day: string, humidity: number, area = 1) => ({
  plantationDate: `${day}T00:00:00.000Z`,
  idealHumidityLevel: humidity,
  surfaceAreaRequired: area,
});

/** A garden with nothing due, next watered in `days`. */
const restingFor = (days: number): WateringPlan => ({
  dueToday: [],
  plantsDue: 0,
  areaDue: 0,
  establishing: 0,
  nextInDays: days,
});

const NOTHING: WateringRound = { due: [], later: [], plantsDue: 0 };

const render = (round: WateringRound, settled = true) => {
  const fixture = TestBed.createComponent(WateringPanel);
  fixture.componentRef.setInput('round', round);
  fixture.componentRef.setInput('settled', settled);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('WateringPanel (the dashboard’s “Water today”)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [WateringPanel], providers: [provideRouter([])] });
  });

  it('shows card ghosts while plants are still arriving, never a partial plan', () => {
    const el = render(NOTHING, false);
    expect(el.querySelectorAll('app-skeleton').length).toBeGreaterThan(0);
    expect(el.querySelector('.grid')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.textContent).not.toContain('Nothing needs water today');
  });

  it('lists each garden to water with its total and zones, and links to it', () => {
    const plan = wateringPlan([bed('2026-05-01', 80, 2), bed('2026-08-02', 40, 1.5)], TODAY);
    const el = render({ due: [{ garden: garden(1, 'Herbs'), plan }], later: [], plantsDue: 2 });

    const card = el.querySelector('[data-testid="water-card"]');
    expect(text(card)).toContain('Herbs');
    expect(text(card)).toContain('2 plants · 3.5 m²');
    const zones = [...el.querySelectorAll('.zone')];
    expect(zones.map((z) => z.getAttribute('data-zone'))).toEqual(['dry', 'humid']);
    expect(zones.map(text)).toEqual(['Dry · 1', 'Humid · 1']);
    expect(card?.getAttribute('href')).toBe('/gardens/1');
    expect(el.querySelector('.note')).toBeNull();
    expect(el.querySelector('[data-testid="water-later"]')).toBeNull();
  });

  it('points out newly planted beds, in the singular too', () => {
    const plan = wateringPlan([bed(TODAY, 40, 0.5)], TODAY);
    const el = render({ due: [{ garden: garden(1, 'Herbs'), plan }], later: [], plantsDue: 1 });

    expect(text(el.querySelector('.total'))).toBe('1 plant · 0.5 m²');
    expect(text(el.querySelector('.note'))).toBe('1 newly planted, watered daily for now');
  });

  it('names the gardens with nothing due today, and when they are next', () => {
    const plan = wateringPlan([bed('2026-05-01', 80)], TODAY);
    const el = render({
      due: [{ garden: garden(1, 'Herbs'), plan }],
      later: [
        { garden: garden(2, 'Roses'), plan: restingFor(1) },
        { garden: garden(3, 'Cacti'), plan: restingFor(3) },
      ],
      plantsDue: 1,
    });

    expect(text(el.querySelector('[data-testid="water-later"]'))).toBe(
      'Not today: Roses (tomorrow), Cacti (in 3 days)',
    );
  });

  it('with nothing due today, says which garden is next', () => {
    const el = render({
      due: [],
      later: [{ garden: garden(2, 'Roses'), plan: restingFor(2) }],
      plantsDue: 0,
    });

    expect(text(el.querySelector('.rest-title'))).toBe('Nothing needs water today');
    expect(text(el.querySelector('.rest-sub'))).toBe('Next: Roses, in 2 days.');
  });

  it('with nothing planted anywhere, invites planting', () => {
    const el = render(NOTHING);
    expect(text(el.querySelector('.rest-sub'))).toBe('Plant something to get a watering plan.');
  });
});
