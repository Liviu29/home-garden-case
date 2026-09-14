import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { Garden, Plant } from '../../../core/api/models';
import type { LayoutPositions } from '../../../state/garden-layout/garden-layout-repository';
import { GardenMap } from './garden-map';

/**
 * The planner tools on top of the digital twin (INTERACTIVE-GARDEN-UX.md):
 * keyboard moves, the home magnet and smart guides, dimensions, watering
 * zones and clashes, "Group by water needs", the planting timeline and the
 * free soil that follows the beds. Driven through the DOM, like a gardener.
 */

const garden = (over: Partial<Garden> = {}): Garden => ({
  gardenId: 1,
  gardenName: 'Sunny Backyard',
  totalSurfaceArea: 20,
  targetHumidityLevel: 60,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const plant = (
  plantId: number,
  surfaceAreaRequired: number,
  plantName: string,
  idealHumidityLevel = 55,
  plantationDate = '2026-04-01T00:00:00.000Z',
): Plant => ({
  plantId,
  plantName,
  species: 'Species',
  plantType: 'vegetable',
  plantationDate,
  surfaceAreaRequired,
  idealHumidityLevel,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

@Component({
  imports: [GardenMap],
  template: `<app-garden-map
    [garden]="garden()"
    [plants]="plants()"
    [positions]="positions()"
    [pendingUpdates]="pending()"
    [(selectedPlantId)]="selected"
    (positionChange)="moves.push($event)"
    (resetPosition)="resets.push($event)"
    (arrangePositions)="arranged = $event"
  />`,
})
class Host {
  readonly garden = signal(garden());
  readonly plants = signal<readonly Plant[]>([]);
  readonly positions = signal<LayoutPositions>({});
  readonly pending = signal<readonly number[]>([]);
  selected: number | null = null;
  readonly moves: { plantId: number; x: number; y: number }[] = [];
  readonly resets: number[] = [];
  arranged: LayoutPositions | null = null;
}

// A 20 m² garden at the fixed 1.6 aspect; a 5 m² bed (25% full) sits in the
// corner block as a near-square 1.87 × 2.67 m bed.
const BOXWOOD = plant(1, 5, 'Boxwood');
// Tomato (dry) | Basil (humid) and Thyme (balanced) on its right.
const TRIO = [plant(1, 8, 'Tomato', 30), plant(2, 4, 'Basil', 85), plant(3, 2, 'Thyme', 60)];
/** px per map unit with the 800×500 stage stub below (the world at Fit). */
const PX = 800 / Math.sqrt(20 * 1.6);

describe('GardenMap — planner tools', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let el: HTMLElement;

  const mount = (plants: readonly Plant[], positions: LayoutPositions = {}, over = {}) => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideNoopAnimations()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    host.garden.set(garden(over));
    host.plants.set(plants);
    host.positions.set(positions);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  };

  const plotNamed = (name: string) =>
    [...el.querySelectorAll<SVGGElement>('g.plot')].find((g) =>
      g.getAttribute('aria-label')?.startsWith(name),
    )!;
  const svg = () => el.querySelector('svg.map-svg') as SVGSVGElement;
  const live = () => el.querySelector('p.visually-hidden[aria-live]')?.textContent?.trim() ?? '';
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
    ) ?? null;
  const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };
  const pointer = (type: string, over: Partial<PointerEventInit> = {}) =>
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      clientX: 200,
      clientY: 200,
      ...over,
    });
  const drag = (g: SVGGElement, dx: number, dy: number) => {
    g.dispatchEvent(pointer('pointerdown'));
    svg().dispatchEvent(pointer('pointermove', { clientX: 200 + dx, clientY: 200 + dy }));
    fixture.detectChanges();
  };
  const drop = (dx: number, dy: number) => {
    svg().dispatchEvent(pointer('pointerup', { clientX: 200 + dx, clientY: 200 + dy }));
    fixture.detectChanges();
  };

  beforeEach(() => {
    // jsdom has neither pointer capture nor SVG layout; these stubs put the
    // gesture code under test (see garden-map.spec for the same rationale).
    for (const [name, value] of [
      ['setPointerCapture', () => undefined],
      ['releasePointerCapture', () => undefined],
      ['hasPointerCapture', () => false],
    ] as const) {
      Object.defineProperty(Element.prototype, name, { value, configurable: true, writable: true });
    }
    const box = { width: 800, height: 500, left: 0, top: 0, right: 800, bottom: 500 };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      ...box,
      x: 0,
      y: 0,
      toJSON: () => box,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('keyboard moves — the alternative to dragging', () => {
    it('arrows nudge the focused bed a quarter metre, Shift a whole metre', () => {
      mount([BOXWOOD]);
      const event = key(plotNamed('Boxwood'), 'ArrowRight');
      expect(event.defaultPrevented).toBe(true); // the stage does not pan too
      expect(host.moves).toEqual([{ plantId: 1, x: 0.25, y: 0 }]);
      expect(host.selected).toBe(1);
      expect(live()).toContain('Boxwood moved to 0.25 by 0 metres.');

      host.positions.set({ 1: { x: 0.25, y: 0 } });
      fixture.detectChanges();
      key(plotNamed('Boxwood'), 'ArrowRight', { shiftKey: true });
      expect(host.moves.at(-1)).toEqual({ plantId: 1, x: 1.25, y: 0 });
    });

    it('a bed already against the fence says so instead of moving', () => {
      mount([BOXWOOD]);
      key(plotNamed('Boxwood'), 'ArrowUp');
      expect(host.moves).toEqual([]);
      expect(live()).toContain('Boxwood is already against the fence.');
    });

    it('Home returns a moved bed to its automatic spot; an unmoved bed stays put', () => {
      mount([BOXWOOD], { 1: { x: 2, y: 0 } });
      expect(key(plotNamed('Boxwood'), 'Home').defaultPrevented).toBe(true);
      expect(host.resets).toEqual([1]);
      expect(live()).toContain('Boxwood returned to its automatic spot.');

      TestBed.resetTestingModule();
      mount([BOXWOOD]);
      key(plotNamed('Boxwood'), 'Home');
      expect(host.resets).toEqual([]);
    });

    it('leaves other keys to the stage, and never moves a bed mid-save', () => {
      mount([BOXWOOD]);
      expect(key(plotNamed('Boxwood'), 'a').defaultPrevented).toBe(false);

      host.pending.set([1]);
      fixture.detectChanges();
      key(plotNamed('Boxwood'), 'ArrowRight');
      expect(host.moves).toEqual([]);
    });
  });

  describe('dragging: the home magnet, smart guides and a live readout', () => {
    it('shows where the bed came from while it is away, with its position', () => {
      mount([BOXWOOD]);
      drag(plotNamed('Boxwood'), 100, 0); // ≈ 0.71 m to the right
      expect(el.querySelector('.home-slot')?.textContent).toContain('Auto spot');
      expect(el.querySelector('.drop-readout')?.textContent?.trim()).toBe('x 0.75 m · y 0 m');
      expect(el.querySelector('.free-label')).toBeNull(); // the ground is changing
    });

    it('dropped near its automatic spot, a moved bed goes home and forgets the custom position', () => {
      mount([BOXWOOD], { 1: { x: 2, y: 0 } });
      drag(plotNamed('Boxwood'), -2 * PX, 0);
      expect(el.querySelector('.drop-preview')?.classList).toContain('at-home');
      expect(el.querySelector('.drop-readout')?.textContent).toContain('Back to its auto spot');
      expect(el.querySelector('.home-slot')).toBeNull(); // it is right there

      drop(-2 * PX, 0);
      expect(host.resets).toEqual([1]);
      expect(host.moves).toEqual([]);
      expect(host.selected).toBe(1);
    });

    it('a bed that never moved, dropped back home, changes nothing', () => {
      mount([BOXWOOD]);
      drag(plotNamed('Boxwood'), 10, 0);
      drop(10, 0);
      expect(host.moves).toEqual([]);
      expect(host.resets).toEqual([]);
    });

    it('draws a smart guide where the bed lines up with a neighbour', () => {
      mount(TRIO);
      drag(plotNamed('Basil'), 0, 0.4 * PX); // down, off home; x still aligned
      expect(el.querySelectorAll('.align-guide').length).toBeGreaterThan(0);
    });

    it('labels the bed in hand with its real width and depth', () => {
      mount([BOXWOOD]);
      plotNamed('Boxwood').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      const dims = [...el.querySelectorAll('.dimension text')].map((t) => t.textContent?.trim());
      expect(dims).toEqual(['1.87 m', '2.67 m']); // 1.87 × 2.67 = its 5 m²
    });
  });

  describe('watering zones and neighbour clashes', () => {
    it('stay hidden until asked for, then tint each bed and link the clashing neighbours', () => {
      mount(TRIO);
      expect(el.querySelector('.zone-tint')).toBeNull();
      expect(el.textContent).toContain('2 watering clashes between neighbouring beds.');

      button('Show on plan')!.click();
      fixture.detectChanges();
      const zones = [...el.querySelectorAll('.zone-tint')].map((z) => z.getAttribute('data-zone'));
      expect(zones.sort()).toEqual(['balanced', 'dry', 'humid']);
      // Tomato 30% | Basil 85% (55 apart) and Basil | Thyme 60% (25 apart).
      expect(el.querySelectorAll('.clash').length).toBe(2);
    });

    it('the layers menu explains the zones while they are shown', () => {
      mount(TRIO);
      button('Toggle layers menu')!.click();
      fixture.detectChanges();
      const toggle = [...el.querySelectorAll<HTMLLabelElement>('.layer-toggle')].find((l) =>
        l.textContent?.includes('Watering zones'),
      )!;
      toggle.querySelector('input')!.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(el.querySelector('.zone-legend')?.textContent).toContain(
        'Neighbours that need different watering',
      );
    });

    it('the inspector names the clashing neighbours of the selected bed', () => {
      mount(TRIO);
      plotNamed('Basil').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      const note = el.querySelector('.clash-note')?.textContent ?? '';
      expect(note).toContain('Tomato');
      expect(note).toContain('Thyme');
    });
  });

  describe('Group by water needs', () => {
    it('regroups every bed as ONE arrangement and shows the zones it grouped by', () => {
      mount(TRIO);
      button('Group by water needs')!.click();
      fixture.detectChanges();
      expect(
        Object.keys(host.arranged ?? {})
          .map(Number)
          .sort(),
      ).toEqual([1, 2, 3]);
      expect(el.querySelectorAll('.zone-tint').length).toBe(3);
      expect(live()).toContain('driest first: 1 dry, 1 balanced, 1 humid');
    });

    it('says so when no overlap-free grouping exists — and leaves the plan alone', () => {
      // 80% full: the least-full garden the packer cannot regroup.
      const areas = [2.5, 1, 1, 1, 1.5, 1];
      const humidity = [60, 30, 60, 85, 85, 30];
      mount(
        areas.map((a, i) => plant(i + 1, a, `Bed ${i + 1}`, humidity[i])),
        {},
        { totalSurfaceArea: 10 },
      );
      button('Group by water needs')!.click();
      fixture.detectChanges();
      expect(host.arranged).toBeNull();
      expect(el.querySelector('.arrange-note')).not.toBeNull();
      expect(live()).toContain('Not enough open ground');

      host.plants.set([plant(1, 2, 'Bed 1', 30), plant(2, 2, 'Bed 2', 85)]);
      fixture.detectChanges();
      expect(el.querySelector('.arrange-note')).toBeNull(); // a new plant set, a fresh try
    });
  });

  describe('planting timeline', () => {
    const SEASON = [
      plant(1, 4, 'Tomato', 55, '2026-04-01T08:00:00.000Z'),
      plant(2, 3, 'Basil', 55, '2026-04-10T08:00:00.000Z'),
      plant(3, 2, 'Thyme', 55, '2026-05-01T08:00:00.000Z'),
    ];
    const futures = () => el.querySelectorAll('g.plot.future').length;
    const readout = () => el.querySelector('.timeline-readout')?.textContent?.replace(/\s+/g, ' ');

    it('needs plants from different days', () => {
      mount([BOXWOOD, plant(2, 3, 'Basil')]);
      const timeline = el.querySelector<HTMLButtonElement>(
        'button[aria-label^="Planting timeline"]',
      );
      expect(timeline!.disabled).toBe(true);
      expect(timeline!.getAttribute('aria-label')).toContain('needs plants from different days');
    });

    it('replays the garden day by day from its first planting, then stops on today', () => {
      vi.useFakeTimers();
      mount(SEASON);
      button('Planting timeline')!.click();
      fixture.detectChanges();

      expect(el.querySelector('.map-hud')).toBeNull(); // the timeline takes its place
      expect(futures()).toBe(2);
      expect(readout()).toContain('Apr 1, 2026');
      expect(readout()).toContain('1 of 3 plants');
      expect(el.querySelector('.free-label')).toBeNull();

      vi.advanceTimersByTime(900);
      fixture.detectChanges();
      expect(futures()).toBe(1);

      vi.advanceTimersByTime(900);
      fixture.detectChanges();
      expect(futures()).toBe(0);
      expect(readout()).toContain('3 of 3 plants');
      expect(button('Play timeline')).not.toBeNull(); // stopped at the end
    });

    it('play restarts at the first day from the end; pause stops it', () => {
      vi.useFakeTimers();
      mount(SEASON);
      button('Planting timeline')!.click();
      vi.advanceTimersByTime(2000);
      fixture.detectChanges();

      button('Play timeline')!.click();
      fixture.detectChanges();
      expect(futures()).toBe(2);
      button('Pause timeline')!.click();
      vi.advanceTimersByTime(2000);
      fixture.detectChanges();
      expect(futures()).toBe(2);
    });

    it('scrubbing pauses the replay and jumps to that day', () => {
      vi.useFakeTimers();
      mount(SEASON);
      button('Planting timeline')!.click();
      fixture.detectChanges();
      const range = el.querySelector<HTMLInputElement>('input.timeline-range')!;
      range.value = '1';
      range.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(futures()).toBe(1);
      expect(button('Play timeline')).not.toBeNull();
    });

    it('under reduced motion it opens paused on the first day', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
      mount(SEASON);
      button('Planting timeline')!.click();
      fixture.detectChanges();
      expect(futures()).toBe(2);
      expect(button('Play timeline')).not.toBeNull();
    });

    it('Escape and the close button both return to today', () => {
      mount(SEASON);
      button('Planting timeline')!.click();
      fixture.detectChanges();
      key(el.querySelector('.map-shell')!, 'Escape');
      expect(el.querySelector('.map-timeline')).toBeNull();
      expect(el.querySelector('.map-hud')).not.toBeNull();
      expect(live()).toContain('Timeline closed');

      button('Planting timeline')!.click();
      fixture.detectChanges();
      button('Close timeline')!.click();
      fixture.detectChanges();
      expect(el.querySelector('.map-timeline')).toBeNull();
      expect(futures()).toBe(0);
    });
  });

  describe('the plan as a list (a text version of the map)', () => {
    const list = () => el.querySelector('app-map-plan-list');
    const rows = () => [...el.querySelectorAll<HTMLTableRowElement>('app-map-plan-list tbody tr')];
    // By the bed's own name — its neighbours' names appear in other rows too.
    const rowOf = (name: string) =>
      rows().find((r) => r.querySelector('th button')?.textContent?.trim() === name)!;
    const openList = () => {
      button('Show the plan as a list')!.click();
      fixture.detectChanges();
    };

    it('lists every bed with its position, size, watering zone and neighbours', () => {
      mount(TRIO);
      openList();

      expect(list()?.getAttribute('role')).toBe('region');
      expect(list()?.getAttribute('aria-label')).toBe('Plan as a list');
      expect(button('Show the plan as a list')?.getAttribute('aria-pressed')).toBe('true');
      expect(rows()).toHaveLength(3);

      const tomato = rowOf('Tomato').textContent.replace(/\s+/g, ' ');
      expect(tomato).toMatch(/m across, [\d.]+ m down/);
      expect(tomato).toContain('8 m²');
      expect(tomato).toContain('Dry');
      // Basil shares Tomato's right edge; being next to each other goes both ways.
      expect(tomato).toContain('Basil');
      expect(rowOf('Basil').textContent).toContain('Tomato');
      expect(rowOf('Basil').textContent).toContain('Humid');
      expect(live()).toContain('Showing the plan as a list of 3 beds');
    });

    it('reads top to bottom, then left to right', () => {
      mount(TRIO);
      openList();

      const at = rows().map((r) => {
        const [, across, down] = /([\d.]+) m across, ([\d.]+) m down/.exec(
          (r.textContent ?? '').replace(/\s+/g, ' '),
        )!;
        return [Number(down), Number(across)];
      });
      expect(at).toEqual([...at].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
    });

    it('chooses a bed from the list: selected on the plan and in the list', () => {
      mount(TRIO);
      openList();

      const basil = rowOf('Basil').querySelector('button')!;
      basil.click();
      fixture.detectChanges();

      expect(host.selected).toBe(2);
      expect(plotNamed('Basil').getAttribute('aria-pressed')).toBe('true');
      expect(rowOf('Basil').querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
      expect(rowOf('Basil').classList).toContain('selected');
    });

    it('marks the beds the gardener placed, and says when a bed stands alone', () => {
      mount([BOXWOOD], { 1: { x: 0, y: 0 } });
      openList();

      expect(rowOf('Boxwood').textContent).toContain('placed by you');
      expect(rowOf('Boxwood').textContent).toContain('no bed alongside');
    });

    it('says so when nothing is planted', () => {
      mount([]);
      openList();

      expect(list()?.textContent).toContain('Nothing is planted yet');
      expect(rows()).toHaveLength(0);
    });

    it('closes with its toolbar button or Escape, and returns to the plan', () => {
      mount(TRIO);
      openList();
      openList();
      expect(list()).toBeNull();
      expect(live()).toContain('Showing the plan.');

      openList();
      key(el.querySelector('.map-shell')!, 'Escape');
      expect(list()).toBeNull();
    });

    it('takes the place of the layers panel and the timeline, and gives way to the timeline', () => {
      mount([
        plant(1, 4, 'Tomato', 55, '2026-04-01T08:00:00.000Z'),
        plant(2, 3, 'Basil', 55, '2026-04-10T08:00:00.000Z'),
      ]);
      button('Toggle layers menu')!.click();
      fixture.detectChanges();
      openList();
      expect(el.querySelector('.layers-panel')).toBeNull();

      button('Planting timeline')!.click();
      fixture.detectChanges();
      expect(list()).toBeNull();
      expect(el.querySelector('.map-timeline')).not.toBeNull();

      openList();
      expect(el.querySelector('.map-timeline')).toBeNull();
      expect(button('Play timeline') ?? button('Pause timeline')).toBeNull();
    });
  });

  describe('free soil follows the beds (a moved bed never breaks the map)', () => {
    it('the ground a bed left becomes open soil and the label moves to the open ground', () => {
      mount([BOXWOOD], { 1: { x: 2, y: 0 } });
      // Largest open spot: the full-height strip the bed left behind (x 0 … 2),
      // which now includes its old corner — the label follows it there.
      const label = el.querySelector('.free-label')!;
      expect(Number(label.getAttribute('x'))).toBeCloseTo(1, 6);
      const holes = [...el.querySelectorAll('mask#free-soil-mask rect[fill="#000"]')];
      expect(holes.map((r) => Number(r.getAttribute('x')))).toEqual([2]);
    });
  });
});
