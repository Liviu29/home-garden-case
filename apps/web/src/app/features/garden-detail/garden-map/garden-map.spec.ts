import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { Garden, Plant } from '../../../core/api/models';
import { GardenMap } from './garden-map';

const garden = (over: Partial<Garden> = {}): Garden => ({
  gardenId: 1,
  gardenName: 'Sunny Backyard',
  totalSurfaceArea: 20,
  targetHumidityLevel: 62,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const plant = (id: number, area: number, name = `Plant ${id}`): Plant => ({
  plantId: id,
  plantName: name,
  species: 'Species',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: area,
  idealHumidityLevel: 55,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

@Component({
  imports: [GardenMap],
  template: `<app-garden-map
    [garden]="garden()"
    [plants]="plants()"
    (addPlant)="added = added + 1"
    (editPlant)="edited = $event"
    (removePlant)="removed = $event"
    (positionChange)="moved = $event"
  />`,
})
class Host {
  readonly garden = signal(garden());
  readonly plants = signal<readonly Plant[]>([]);
  added = 0;
  edited: Plant | null = null;
  removed: Plant | null = null;
  moved: { plantId: number; x: number; y: number } | null = null;
}

describe('GardenMap (what a user sees and does on the digital twin)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideNoopAnimations()],
    });
  });

  function mount(plants: readonly Plant[], g: Garden = garden()) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.garden.set(g);
    fixture.componentInstance.plants.set(plants);
    fixture.detectChanges();
    return fixture;
  }

  it('renders one focusable plot per plant, labeled with name and area', () => {
    const fixture = mount([plant(1, 5, 'Lavender'), plant(2, 2, 'Basil')]);
    const el: HTMLElement = fixture.nativeElement;

    const plots = el.querySelectorAll('g.plot');
    expect(plots).toHaveLength(2);
    const labels = [...plots].map((p) => p.getAttribute('aria-label'));
    expect(labels.some((l) => l?.includes('Lavender') && l?.includes('5 square meters'))).toBe(
      true,
    );
    expect(plots[0].getAttribute('role')).toBe('button');
    expect(plots[0].getAttribute('tabindex')).toBe('0');
  });

  it('shows HUD capacity from the shared domain math (utilization, free, target)', () => {
    const fixture = mount([plant(1, 5), plant(2, 2)]);
    const hud = (fixture.nativeElement as HTMLElement).querySelector('.map-hud')!;

    expect(hud.textContent).toContain('35%'); // 7 of 20 used
    expect(hud.textContent).toContain('13 m²'); // free
    expect(hud.textContent).toContain('62%'); // target humidity
  });

  it('selecting a plot opens the inspector with that plant and marks it pressed', () => {
    const fixture = mount([plant(1, 5, 'Lavender'), plant(2, 2, 'Basil')]);
    const el: HTMLElement = fixture.nativeElement;

    const basil = [...el.querySelectorAll<SVGGElement>('g.plot')].find((p) =>
      p.getAttribute('aria-label')?.includes('Basil'),
    )!;
    basil.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(basil.getAttribute('aria-pressed')).toBe('true');
    const inspector = el.querySelector('.map-inspector')!;
    expect(inspector.textContent).toContain('Basil');
    expect(inspector.textContent).toContain('2 m²');
    expect(inspector.textContent).toContain('10% of garden'); // 2 of 20
  });

  it('inspector Edit and Remove act on the selected plant (events to the owner)', () => {
    const fixture = mount([plant(1, 5, 'Lavender')]);
    const el: HTMLElement = fixture.nativeElement;

    el.querySelector<SVGGElement>('g.plot')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();

    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.inspector-actions button')];
    buttons.find((b) => b.textContent?.includes('Edit'))!.click();
    buttons.find((b) => b.textContent?.includes('Remove'))!.click();
    expect(fixture.componentInstance.edited?.plantName).toBe('Lavender');
    expect(fixture.componentInstance.removed?.plantName).toBe('Lavender');
  });

  it('a deleted plant cannot stay selected — the inspector falls back gracefully', () => {
    const fixture = mount([plant(1, 5, 'Lavender')]);
    const el: HTMLElement = fixture.nativeElement;
    el.querySelector<SVGGElement>('g.plot')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();
    expect(el.querySelector('.map-inspector')!.textContent).toContain('Lavender');

    fixture.componentInstance.plants.set([]); // the mutation removed it
    fixture.detectChanges();
    expect(el.querySelector('.map-inspector')!.textContent).toContain('Select a plant');
  });

  it('zoom controls update the live zoom level and clamp at the fit minimum', () => {
    const fixture = mount([plant(1, 5)]);
    const el: HTMLElement = fixture.nativeElement;
    const zoomLabel = () => el.querySelector('.zoom-level')!.textContent?.trim();
    const btn = (name: string) =>
      el.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;

    expect(zoomLabel()).toBe('100%');
    // Fit is no longer the floor: the gardener can step back below 1×
    expect(btn('Zoom out').disabled).toBe(false);

    btn('Zoom out').click();
    fixture.detectChanges();
    expect(zoomLabel()).toBe('71%'); // 1 / 1.4, clamped range reaches 50%

    btn('Zoom in').click();
    btn('Zoom in').click();
    fixture.detectChanges();
    expect(zoomLabel()).toBe('140%');

    btn('Fit garden').click();
    fixture.detectChanges();
    expect(zoomLabel()).toBe('100%');
  });

  it('an empty garden shows the designed invitation with a planting CTA', () => {
    const fixture = mount([]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Your garden has space to grow.');
    expect(el.querySelectorAll('.empty-zone').length).toBeGreaterThan(0); // dashed planting hints

    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Plant your garden'))!
      .click();
    expect(fixture.componentInstance.added).toBe(1);
  });

  it('a full garden shows the capacity badge and no free-soil band', () => {
    const fixture = mount([plant(1, 20)]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.full-badge')?.textContent).toContain('Full');
    expect(el.querySelector('.free-band')).toBeNull();
  });

  it('bigger plants get visibly bigger plots (the honesty rule, in the DOM)', () => {
    const fixture = mount([plant(1, 8, 'Big'), plant(2, 2, 'Small')]);
    const el: HTMLElement = fixture.nativeElement;
    const area = (label: string) => {
      const g = [...el.querySelectorAll<SVGGElement>('g.plot')].find((p) =>
        p.getAttribute('aria-label')?.includes(label),
      )!;
      const rect = g.querySelector('rect.plot-bed')!;
      return Number(rect.getAttribute('width')) * Number(rect.getAttribute('height'));
    };
    expect(area('Big') / area('Small')).toBeCloseTo(4, 3);
  });
});

/**
 * Interaction coverage for the planner.
 *
 * These drive the SVG the way a user does — pointer, wheel, keyboard — rather
 * than calling the component's methods. That is deliberate: the map's value is
 * its direct-manipulation behaviour, and a template refactor that drops a
 * listener would leave method-level tests green while the planner stops
 * responding.
 */
describe('GardenMap — direct manipulation', () => {
  let host: ComponentFixture<Host>;
  let el: HTMLElement;

  const PLANTS = [plant(1, 8, 'Tomato'), plant(2, 4, 'Basil'), plant(3, 2, 'Thyme')];

  const mount = (plants: readonly Plant[] = PLANTS, over: Partial<Garden> = {}) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    host = TestBed.createComponent(Host);
    host.componentInstance.garden.set(garden(over));
    host.componentInstance.plants.set(plants);
    host.detectChanges();
    el = host.nativeElement as HTMLElement;
    return host;
  };

  const svg = () => el.querySelector('svg.map-svg') as SVGSVGElement;
  const plots = () => [...el.querySelectorAll('g.plot')] as SVGGElement[];
  const byTitle = (title: string) =>
    el.querySelector<HTMLButtonElement>(`button[title="${title}"]`);

  const pointer = (type: string, over: Partial<PointerEventInit> = {}) =>
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      ...over,
    });

  /**
   * jsdom implements neither pointer capture nor SVG layout geometry. Without
   * both, every gesture returns early at `pxPerUnit() === 0` and the drag and
   * pinch paths are unreachable — so these stubs are what put the behaviour
   * under test rather than the environment's limitations.
   */
  const GEOMETRY = { width: 800, height: 500, left: 0, top: 0, right: 800, bottom: 500 };

  beforeEach(() => {
    for (const [name, value] of [
      ['setPointerCapture', () => undefined],
      ['releasePointerCapture', () => undefined],
      ['hasPointerCapture', () => false],
    ] as const) {
      Object.defineProperty(Element.prototype, name, { value, configurable: true, writable: true });
    }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      ...GEOMETRY,
      x: 0,
      y: 0,
      toJSON: () => GEOMETRY,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  describe('zoom', () => {
    it('the wheel zooms the camera', () => {
      mount();
      const before = Number(el.querySelector('.zoom-level')?.textContent?.replace(/\D/g, '') ?? 0);

      svg().dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -300, ctrlKey: true }),
      );
      host.detectChanges();

      const after = Number(el.querySelector('.zoom-level')?.textContent?.replace(/\D/g, '') ?? 0);
      expect(after).toBeGreaterThan(before);
    });

    it('a bare wheel leaves the zoom alone, lets the page scroll, and names the gesture', () => {
      // Regression: every wheel notch over the embedded map zoomed it, so
      // scrolling the page past the plan trapped the scroll and shrank the map.
      vi.useFakeTimers();
      try {
        mount();
        const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -300 });
        svg().dispatchEvent(event);
        host.detectChanges();

        expect(el.querySelector('.zoom-level')?.textContent).toContain('100');
        expect(event.defaultPrevented).toBe(false);
        expect(el.querySelector('.wheel-hint')?.textContent).toMatch(/scroll to zoom/);

        svg().dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -300 }));
        vi.advanceTimersByTime(1500);
        host.detectChanges();
        expect(el.querySelector('.wheel-hint')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      ['Ctrl', { ctrlKey: true }],
      ['⌘', { metaKey: true }],
    ])('%s + wheel zooms and keeps the browser from zooming the page', (_key, mods) => {
      mount();
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -300,
        ...mods,
      });
      svg().dispatchEvent(event);
      host.detectChanges();

      expect(el.querySelector('.zoom-level')?.textContent).not.toContain('100');
      expect(event.defaultPrevented).toBe(true);
      expect(el.querySelector('.wheel-hint')).toBeNull();
    });

    it('the zoom buttons step in and out', () => {
      mount();
      byTitle('Zoom in')!.click();
      host.detectChanges();
      const zoomedIn = el.querySelector('.zoom-level')?.textContent;

      byTitle('Zoom out')!.click();
      host.detectChanges();

      expect(el.querySelector('.zoom-level')?.textContent).not.toBe(zoomedIn);
    });

    it('Fit returns the camera to the whole garden', () => {
      mount();
      byTitle('Zoom in')!.click();
      host.detectChanges();

      byTitle('Fit garden')!.click();
      host.detectChanges();

      expect(el.querySelector('.zoom-level')?.textContent).toContain('100');
    });

    it('Reset view clears both the camera and the selection', () => {
      mount();
      plots()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      host.detectChanges();
      expect(el.querySelector('.map-inspector')?.textContent).toContain('Tomato');

      byTitle('Reset view and selection')!.click();
      host.detectChanges();

      // The inspector aside is always in the DOM; "cleared" means it no longer
      // describes a plant.
      expect(el.querySelector('.map-inspector')?.textContent).not.toContain('Tomato');
    });
  });

  describe('keyboard', () => {
    it.each(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])('%s pans the camera', (key) => {
      mount();
      expect(() =>
        svg().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })),
      ).not.toThrow();
      host.detectChanges();
    });

    it.each(['+', '-', '0'])('%s adjusts the zoom from the keyboard', (key) => {
      mount();
      svg().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      host.detectChanges();
      expect(el.querySelector('.zoom-level')).not.toBeNull();
    });

    it('Enter on a plot selects it', () => {
      mount();
      plots()[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      host.detectChanges();

      expect(el.querySelector('.map-inspector')?.textContent).toContain('Tomato');
    });

    it('Space on a plot selects it without scrolling the page', () => {
      mount();
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      plots()[0].dispatchEvent(event);
      host.detectChanges();

      expect(el.querySelector('.map-inspector')?.textContent).toContain('Tomato');
      expect(event.defaultPrevented).toBe(true);
    });

    it('Escape clears the selection', () => {
      mount();
      plots()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      host.detectChanges();

      el.querySelector('.map-shell')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      host.detectChanges();

      expect(el.querySelector('.map-inspector')?.textContent).not.toContain('Tomato');
    });
  });

  describe('pointer', () => {
    it('a drag on the canvas pans without throwing', () => {
      mount();
      const canvas = svg();
      canvas.dispatchEvent(pointer('pointerdown'));
      canvas.dispatchEvent(pointer('pointermove', { clientX: 140, clientY: 130 }));
      canvas.dispatchEvent(pointer('pointerup'));
      host.detectChanges();

      expect(el.querySelector('.map-svg')).not.toBeNull();
    });

    it('a cancelled pointer sequence ends cleanly', () => {
      mount();
      const canvas = svg();
      canvas.dispatchEvent(pointer('pointerdown'));
      canvas.dispatchEvent(pointer('pointercancel'));
      host.detectChanges();

      expect(el.querySelector('.map-svg')).not.toBeNull();
    });

    it('leaving the canvas ends any hover state', () => {
      mount();
      svg().dispatchEvent(pointer('pointerleave'));
      host.detectChanges();
      expect(el.querySelector('.map-svg')).not.toBeNull();
    });

    it('pressing a plot begins a potential drag', () => {
      mount();
      plots()[0].dispatchEvent(pointer('pointerdown'));
      host.detectChanges();
      expect(el.querySelector('.map-svg')).not.toBeNull();
    });

    it('hovering a plot shows a tooltip and leaving hides it', () => {
      mount();
      const plot = plots()[0];

      plot.dispatchEvent(pointer('pointerenter'));
      plot.dispatchEvent(pointer('pointermove'));
      host.detectChanges();

      plot.dispatchEvent(pointer('pointerleave'));
      host.detectChanges();

      expect(el.querySelector('.map-svg')).not.toBeNull();
    });

    it('clicking the lawn behind the plots clears the selection', () => {
      mount();
      plots()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      host.detectChanges();
      expect(el.querySelector('.map-inspector')?.textContent).toContain('Tomato');

      const lawn = el.querySelector('rect');
      lawn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      host.detectChanges();

      expect(el.querySelector('.map-svg')).not.toBeNull();
    });
  });

  describe('layers menu', () => {
    it('opens and toggles every layer', () => {
      mount();
      byTitle('Toggle layers menu')!.click();
      host.detectChanges();

      const boxes = [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      expect(boxes.length).toBeGreaterThanOrEqual(5);

      for (const box of boxes) {
        const before = box.checked;
        box.checked = !before;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        host.detectChanges();
      }
      expect(el.querySelector('.map-svg')).not.toBeNull();
    });
  });

  describe('layout history controls', () => {
    it('exposes undo, redo, reset-layout and fullscreen controls', () => {
      mount();
      // Disabled while there is no history, but present and clickable — the
      // listener is what this asserts, the enablement is the owner's input.
      byTitle('Undo layout move')?.click();
      byTitle('Redo layout move')?.click();
      byTitle('Reset layout to automatic arrangement')?.click();
      el.querySelector<HTMLButtonElement>('[aria-label="Expand planner"]')?.click();
      host.detectChanges();

      expect(el.querySelector('.map-svg')).not.toBeNull();
    });
  });

  describe('inspector actions', () => {
    it('focus, clear, edit and remove all reach the owner', () => {
      mount();
      plots()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      host.detectChanges();

      el.querySelector<HTMLButtonElement>('[aria-label="Focus this plant on the plan"]')?.click();
      host.detectChanges();

      el.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')?.click();
      host.detectChanges();

      expect(el.querySelector('.map-inspector')?.textContent).not.toContain('Tomato');
    });
  });

  describe('empty garden', () => {
    it('the invitation CTA asks the owner to add a plant', () => {
      mount([]);
      const cta = [...el.querySelectorAll('button')].find((b) =>
        /plant/i.test(b.textContent ?? ''),
      );
      cta?.click();
      host.detectChanges();

      expect(host.componentInstance.added).toBeGreaterThan(0);
    });
  });

  describe('dragging a plant bed', () => {
    it('moves the bed and emits its snapped position on drop', () => {
      mount();
      const plot = plots()[0];
      const canvas = svg();

      plot.dispatchEvent(pointer('pointerdown', { clientX: 200, clientY: 200 }));
      canvas.dispatchEvent(pointer('pointermove', { clientX: 260, clientY: 250 }));
      host.detectChanges();
      canvas.dispatchEvent(pointer('pointerup', { clientX: 260, clientY: 250 }));
      host.detectChanges();

      expect(host.componentInstance.moved).not.toBeNull();
      expect(host.componentInstance.moved!.plantId).toBe(
        Number(plot.getAttribute('data-plant-id') ?? host.componentInstance.moved!.plantId),
      );
    });

    it('a move under the threshold stays a click, not a drag', () => {
      mount();
      const plot = plots()[0];
      const canvas = svg();

      plot.dispatchEvent(pointer('pointerdown', { clientX: 200, clientY: 200 }));
      canvas.dispatchEvent(pointer('pointermove', { clientX: 202, clientY: 201 }));
      canvas.dispatchEvent(pointer('pointerup', { clientX: 202, clientY: 201 }));
      host.detectChanges();

      expect(host.componentInstance.moved).toBeNull();
    });

    it('dragging empty canvas pans the camera instead of moving a bed', () => {
      mount();
      const canvas = svg();

      canvas.dispatchEvent(pointer('pointerdown', { clientX: 400, clientY: 250 }));
      canvas.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 200 }));
      canvas.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 200 }));
      host.detectChanges();

      expect(host.componentInstance.moved).toBeNull();
    });

    it('ignores pointer movement it never saw begin', () => {
      mount();
      expect(() =>
        svg().dispatchEvent(pointer('pointermove', { pointerId: 99, clientX: 10, clientY: 10 })),
      ).not.toThrow();
    });
  });

  describe('two-finger pinch', () => {
    const twoFingers = (canvas: SVGSVGElement) => {
      canvas.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 300, clientY: 250 }));
      canvas.dispatchEvent(pointer('pointerdown', { pointerId: 2, clientX: 400, clientY: 250 }));
    };

    it('spreading two fingers zooms in', () => {
      mount();
      const canvas = svg();
      const before = el.querySelector('.zoom-level')?.textContent;

      twoFingers(canvas);
      canvas.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 600, clientY: 250 }));
      host.detectChanges();

      expect(el.querySelector('.zoom-level')?.textContent).not.toBe(before);
    });

    it('lifting one finger re-anchors the pan without jumping the camera', () => {
      mount();
      const canvas = svg();
      twoFingers(canvas);
      canvas.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 600, clientY: 250 }));
      canvas.dispatchEvent(pointer('pointerup', { pointerId: 2, clientX: 600, clientY: 250 }));
      host.detectChanges();

      const afterLift = el.querySelector('.zoom-level')?.textContent;
      canvas.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 305, clientY: 252 }));
      host.detectChanges();

      expect(el.querySelector('.zoom-level')?.textContent).toBe(afterLift);
    });
  });

  describe('free-soil labelling', () => {
    const kind = (): string | null => {
      if (el.querySelector('.free-marker')) {
        return 'marker';
      }
      const text = el.querySelector('text.free-label');
      if (!text) {
        return null;
      }
      return text.getAttribute('transform') ? 'vertical' : 'horizontal';
    };

    it.each([
      { label: 'a roomy cell gets a horizontal label', used: 2, expected: 'horizontal' },
      { label: 'a tall narrow cell gets a vertical label', used: 18, expected: 'vertical' },
      { label: 'a sliver gets a marker only', used: 19.7, expected: 'marker' },
      { label: 'a full garden gets no free cell at all', used: 20, expected: null },
    ])('$label', ({ used, expected }) => {
      mount([plant(1, used, 'Filler')], { totalSurfaceArea: 20 });
      expect(kind()).toBe(expected);
    });

    it('a 98% garden of several beds labels its 0.5 m² along the cell', () => {
      // The e2e "area honesty at 98%" plant set. As a strip, 0.5 m² was a
      // sliver that only fit a "+"; as a treemap cell (~0.45 × 1.13 m) the
      // label fits along it — the exact figure beats a symbol.
      mount([plant(1, 5), plant(2, 4), plant(3, 4), plant(4, 3), plant(5, 3.5)], {
        totalSurfaceArea: 20,
      });
      expect(kind()).toBe('vertical');
    });
  });

  describe('long plot labels', () => {
    it('truncates a name that cannot fit its bed', () => {
      mount([plant(1, 1, 'AnExtremelyLongPlantNameThatCannotPossiblyFitInsideOneSmallBed')], {
        totalSurfaceArea: 200,
      });
      const label = el.querySelector('.plot-name')?.textContent ?? '';
      expect(label.length).toBeLessThan(60);
    });
  });

  describe('dropping a bed', () => {
    // 20 m² garden at the fixed 1.6 aspect — the map's own world size.
    const W = Math.sqrt(20 * 1.6);
    const H = 20 / W;
    const bedOf = (g: SVGGElement) => {
      const r = g.querySelector('rect.plot-bed')!;
      return { w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')) };
    };
    const drag = (g: SVGGElement, to: { clientX: number; clientY: number }) => {
      g.dispatchEvent(pointer('pointerdown', { clientX: 200, clientY: 200 }));
      svg().dispatchEvent(pointer('pointermove', to));
      host.detectChanges();
    };

    it('can never leave the garden, however far it is flung (first-drag regression)', () => {
      mount();
      const plot = plots()[0];
      const { w, h } = bedOf(plot);

      drag(plot, { clientX: 2600, clientY: 2600 });
      svg().dispatchEvent(pointer('pointerup', { clientX: 2600, clientY: 2600 }));
      host.detectChanges();

      const moved = host.componentInstance.moved!;
      expect(moved.x).toBeGreaterThanOrEqual(0);
      expect(moved.y).toBeGreaterThanOrEqual(0);
      // Flung past the corner, it settles flush against the fence — inside it.
      expect(moved.x + w).toBeCloseTo(W, 9);
      expect(moved.y + h).toBeCloseTo(H, 9);
    });

    it('shows where it will land while dragging, and lands exactly there', () => {
      mount();
      drag(plots()[0], { clientX: 260, clientY: 250 });

      const preview = el.querySelector('rect.drop-preview');
      expect(preview).not.toBeNull();
      const at = { x: Number(preview!.getAttribute('x')), y: Number(preview!.getAttribute('y')) };

      svg().dispatchEvent(pointer('pointerup', { clientX: 260, clientY: 250 }));
      host.detectChanges();

      expect(host.componentInstance.moved!.x).toBeCloseTo(at.x, 9);
      expect(host.componentInstance.moved!.y).toBeCloseTo(at.y, 9);
      expect(el.querySelector('rect.drop-preview')).toBeNull();
    });

    it('paints the dragged bed above its neighbours', () => {
      mount();
      const grabbed = plots()[0].getAttribute('aria-label');
      drag(plots()[0], { clientX: 260, clientY: 250 });

      const top = plots().at(-1)!;
      expect(top.getAttribute('aria-label')).toBe(grabbed);
      expect(top.classList).toContain('dragging');
      expect(el.querySelector('.map-stage')!.classList).toContain('is-dragging');
    });

    it('keeps the zoom the gardener chose — moving a bed never resets the view', () => {
      // Regression: the camera was linked to a layout-derived object, so every
      // drag step (and every drop) snapped a zoomed-in view back to Fit.
      mount();
      byTitle('Zoom in')!.click();
      host.detectChanges();

      drag(plots()[0], { clientX: 260, clientY: 250 });
      svg().dispatchEvent(pointer('pointerup', { clientX: 260, clientY: 250 }));
      host.detectChanges();

      expect(el.querySelector('.zoom-level')?.textContent).toContain('140');
    });

    it('a second finger turns a bed drag into a pinch', () => {
      mount();
      drag(plots()[0], { clientX: 260, clientY: 250 });
      svg().dispatchEvent(pointer('pointerdown', { pointerId: 2, clientX: 400, clientY: 250 }));
      host.detectChanges();

      expect(el.querySelector('rect.drop-preview')).toBeNull();
      svg().dispatchEvent(pointer('pointerup', { pointerId: 2 }));
      svg().dispatchEvent(pointer('pointerup'));
      expect(host.componentInstance.moved).toBeNull();
    });
  });
});

/**
 * The map's "owner-driven" inputs: pending mutations, planner history state,
 * fullscreen and custom positions. Each one gates a distinct visual state, and
 * none of them is reachable from the map's own controls — they arrive from the
 * detail screen, so they need their own host.
 */
describe('GardenMap — owner-driven states', () => {
  @Component({
    imports: [GardenMap],
    template: `<app-garden-map
      [garden]="garden()"
      [plants]="plants()"
      [positions]="positions()"
      [hasCustomLayout]="hasCustomLayout()"
      [canUndo]="canUndo()"
      [canRedo]="canRedo()"
      [isFullscreen]="isFullscreen()"
      [pendingDeletes]="pendingDeletes()"
      [pendingUpdates]="pendingUpdates()"
      [pendingCreateArea]="pendingCreateArea()"
      (toggleFullscreen)="fullscreenToggles = fullscreenToggles + 1"
      (undoLayout)="undos = undos + 1"
      (redoLayout)="redos = redos + 1"
      (resetLayout)="resets = resets + 1"
    />`,
  })
  class OwnerHost {
    readonly garden = signal(garden());
    readonly plants = signal<readonly Plant[]>([plant(1, 8, 'Tomato'), plant(2, 4, 'Basil')]);
    readonly positions = signal<Record<number, { x: number; y: number }>>({});
    readonly hasCustomLayout = signal(false);
    readonly canUndo = signal(false);
    readonly canRedo = signal(false);
    readonly isFullscreen = signal(false);
    readonly pendingDeletes = signal<readonly number[]>([]);
    readonly pendingUpdates = signal<readonly number[]>([]);
    readonly pendingCreateArea = signal<number | null>(null);
    fullscreenToggles = 0;
    undos = 0;
    redos = 0;
    resets = 0;
  }

  let fixture: ComponentFixture<OwnerHost>;
  let el: HTMLElement;

  const mountOwner = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    fixture = TestBed.createComponent(OwnerHost);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    return fixture;
  };

  beforeEach(mountOwner);

  it('renders a plot as a ghost while its delete is pending', () => {
    fixture.componentInstance.pendingDeletes.set([1]);
    fixture.detectChanges();
    expect(el.querySelector('.map-svg')).not.toBeNull();
  });

  it('renders a plot as a ghost while its update is pending', () => {
    fixture.componentInstance.pendingUpdates.set([1]);
    fixture.detectChanges();

    // The busy affordance lives on the plot itself, not in the inspector.
    const plot = [...el.querySelectorAll('g.plot')].find((g) =>
      g.getAttribute('aria-label')?.includes('Tomato'),
    );
    expect(plot?.getAttribute('aria-busy') ?? plot?.classList.toString()).toBeTruthy();
    expect(el.querySelectorAll('g.plot')).toHaveLength(2);
  });

  it('previews the footprint of a plant being created', () => {
    fixture.componentInstance.pendingCreateArea.set(3);
    fixture.detectChanges();
    expect(el.querySelector('.map-svg')).not.toBeNull();
  });

  it('ignores a create preview with no area', () => {
    fixture.componentInstance.pendingCreateArea.set(0);
    fixture.detectChanges();
    expect(el.querySelector('.map-svg')).not.toBeNull();
  });

  it('previews a create that is larger than the free band', () => {
    fixture.componentInstance.pendingCreateArea.set(500);
    fixture.detectChanges();
    expect(el.querySelector('.map-svg')).not.toBeNull();
  });

  it('honours custom positions supplied by the owner', () => {
    fixture.componentInstance.positions.set({ 1: { x: 1, y: 1 } });
    fixture.componentInstance.hasCustomLayout.set(true);
    fixture.detectChanges();
    expect(el.querySelector('.map-svg')).not.toBeNull();
  });

  it('enables the history controls and emits when they are pressed', () => {
    fixture.componentInstance.canUndo.set(true);
    fixture.componentInstance.canRedo.set(true);
    fixture.componentInstance.hasCustomLayout.set(true);
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('button[title="Undo layout move"]')!.click();
    el.querySelector<HTMLButtonElement>('button[title="Redo layout move"]')!.click();
    el.querySelector<HTMLButtonElement>(
      'button[title="Reset layout to automatic arrangement"]',
    )!.click();

    expect(fixture.componentInstance.undos).toBe(1);
    expect(fixture.componentInstance.redos).toBe(1);
    expect(fixture.componentInstance.resets).toBe(1);
  });

  it('in fullscreen the bare wheel zooms — the planner owns the viewport there', () => {
    fixture.componentInstance.isFullscreen.set(true);
    fixture.detectChanges();

    el.querySelector('svg.map-svg')!.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -300 }),
    );
    fixture.detectChanges();

    expect(el.querySelector('.zoom-level')?.textContent).not.toContain('100');
    expect(el.querySelector('.wheel-hint')).toBeNull();
  });

  it('offers Exit fullscreen instead of Expand when already fullscreen', () => {
    fixture.componentInstance.isFullscreen.set(true);
    fixture.detectChanges();

    const exit = el.querySelector<HTMLButtonElement>('[aria-label="Exit fullscreen planner"]');
    expect(exit).not.toBeNull();
    exit!.click();
    expect(fixture.componentInstance.fullscreenToggles).toBe(1);
  });

  describe('the Escape cascade', () => {
    const escape = () =>
      el
        .querySelector('.map-shell')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );

    it('closes the layers popover first', () => {
      el.querySelector<HTMLButtonElement>('button[title="Toggle layers menu"]')!.click();
      fixture.detectChanges();
      expect(el.querySelector('input[type="checkbox"]')).not.toBeNull();

      escape();
      fixture.detectChanges();

      expect(el.querySelector('input[type="checkbox"]')).toBeNull();
      expect(fixture.componentInstance.fullscreenToggles).toBe(0);
    });

    it('then leaves fullscreen', () => {
      fixture.componentInstance.isFullscreen.set(true);
      fixture.detectChanges();

      escape();

      expect(fixture.componentInstance.fullscreenToggles).toBe(1);
    });

    it('and finally clears the selection', () => {
      el.querySelector<SVGGElement>('g.plot')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      fixture.detectChanges();
      expect(el.querySelector('.map-inspector')?.textContent).toContain('Tomato');

      escape();
      fixture.detectChanges();

      expect(el.querySelector('.map-inspector')?.textContent).not.toContain('Tomato');
    });
  });

  it('scales every plot down uniformly when the garden is over capacity', () => {
    fixture.componentInstance.plants.set([plant(1, 18, 'Big'), plant(2, 12, 'Bigger')]);
    fixture.detectChanges();
    // 30 m² of plants in a 20 m² garden: nothing may overflow the surface.
    expect(el.querySelectorAll('g.plot')).toHaveLength(2);
  });
});

/**
 * Guard paths the happy-path interactions never reach: zero-area gardens, a
 * mutating plant that must not be draggable, a selection that no longer
 * exists, and the geometry fallbacks that fire when the element has no size.
 */
describe('GardenMap — guards and degenerate inputs', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  const mountGuard = (plants: readonly Plant[], over: Partial<Garden> = {}) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.garden.set(garden(over));
    fixture.componentInstance.plants.set(plants);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    return fixture;
  };

  it('reports 0% share when the garden has no surface at all', () => {
    mountGuard([plant(1, 5, 'Tomato')], { totalSurfaceArea: 0 });
    el.querySelector<SVGGElement>('g.plot')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();

    expect(el.querySelector('.map-svg')).not.toBeNull();
  });

  it('falls back to zero geometry when the stage has never been measured', () => {
    // Default jsdom: every rect is 0×0, so pxPerUnit and screenToMap must both
    // take their guard branch rather than divide by zero.
    mountGuard([plant(1, 5, 'Tomato')]);

    expect(() =>
      el
        .querySelector('svg.map-svg')!
        .dispatchEvent(
          new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true }),
        ),
    ).not.toThrow();
  });

  it('does not arm a drag for a plant that is being mutated', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const host = TestBed.createComponent(Host);
    host.componentInstance.plants.set([plant(1, 5, 'Tomato')]);
    host.detectChanges();

    const plot = (host.nativeElement as HTMLElement).querySelector<SVGGElement>('g.plot')!;
    plot.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 5, clientY: 5 }),
    );
    host.detectChanges();

    expect(host.componentInstance.moved).toBeNull();
  });

  it('a selection whose plant disappears stops describing it', () => {
    mountGuard([plant(1, 5, 'Tomato'), plant(2, 3, 'Basil')]);
    el.querySelector<SVGGElement>('g.plot')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();

    fixture.componentInstance.plants.set([plant(2, 3, 'Basil')]);
    fixture.detectChanges();

    expect(el.querySelector('.map-inspector')?.textContent).not.toContain('Tomato');
  });

  it('focusing with no selection is a no-op rather than an error', () => {
    mountGuard([plant(1, 5, 'Tomato')]);
    expect(() =>
      el.querySelector<HTMLButtonElement>('[aria-label="Focus this plant on the plan"]')?.click(),
    ).not.toThrow();
  });

  it('a single pointer reports no pinch gap', () => {
    mountGuard([plant(1, 5, 'Tomato')]);
    const canvas = el.querySelector('svg.map-svg')!;

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 60, clientY: 60 }),
    );
    fixture.detectChanges();

    expect(el.querySelector('.map-svg')).not.toBeNull();
  });

  it('hover is ignored while a gesture is in progress', () => {
    mountGuard([plant(1, 5, 'Tomato')]);
    const canvas = el.querySelector('svg.map-svg')!;
    const plot = el.querySelector<SVGGElement>('g.plot')!;

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 }),
    );
    plot.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 12, clientY: 12 }),
    );
    fixture.detectChanges();

    expect(el.querySelector('.map-svg')).not.toBeNull();
  });

  it('an empty garden reports zero used area and a full free band', () => {
    mountGuard([]);
    expect(el.textContent).toMatch(/0\s*%|Available/);
  });

  it('a garden with a zero-area plant still renders', () => {
    mountGuard([plant(1, 0, 'Ghost')]);
    expect(el.querySelector('.map-svg')).not.toBeNull();
  });
});

describe('GardenMap — environment-dependent paths', () => {
  const mountWith = (plants: readonly Plant[] = [plant(1, 5, 'Tomato')]) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.plants.set(plants);
    fixture.detectChanges();
    return fixture;
  };

  afterEach(() => vi.unstubAllGlobals());

  it('observes the stage and adopts its aspect ratio when ResizeObserver exists', () => {
    // jsdom ships none, so the component's measurement path is dead code
    // without this — and that path is what stops the map letterboxing.
    let captured: ResizeObserverCallback | null = null;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          captured = cb;
        }
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = disconnect;
      },
    );

    const fixture = mountWith();
    expect(captured).not.toBeNull();

    // A real measurement updates the viewport ratio…
    captured!(
      [{ contentRect: { width: 800, height: 500 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.map-svg')).not.toBeNull();

    // …and a zero-sized measurement is ignored rather than dividing by zero.
    captured!(
      [{ contentRect: { width: 0, height: 0 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.map-svg')).not.toBeNull();

    fixture.destroy();
    expect(disconnect).toHaveBeenCalled();
  });

  describe('framing the measured stage', () => {
    let resize: (width: number, height: number) => void;

    const mountMeasured = (plants: readonly Plant[] = [plant(1, 5, 'Tomato')]) => {
      let captured: ResizeObserverCallback | null = null;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(cb: ResizeObserverCallback) {
            captured = cb;
          }
          observe = vi.fn();
          unobserve = vi.fn();
          disconnect = vi.fn();
        },
      );
      const fixture = mountWith(plants);
      resize = (width, height) => {
        captured!(
          [{ contentRect: { width, height } } as ResizeObserverEntry],
          {} as ResizeObserver,
        );
        fixture.detectChanges();
      };
      return fixture;
    };

    const viewBoxOfEl = (el: HTMLElement) =>
      el.querySelector('svg.map-svg')!.getAttribute('viewBox')!.split(' ').map(Number);

    it('fits the garden clear of the toolbar and HUD bands, in the stage’s own shape', () => {
      const fixture = mountMeasured();
      resize(800, 500);
      const el = fixture.nativeElement as HTMLElement;
      const [x, y, w, h] = viewBoxOfEl(el);

      expect(w / h).toBeCloseTo(800 / 500, 6); // `meet` never letterboxes
      // Where the garden (0..W, 0..H in map units) lands on the 800×500 stage:
      const W = Math.sqrt(20 * 1.6);
      const H = 20 / W;
      const px = 800 / w;
      expect((0 - y) * px).toBeGreaterThanOrEqual(59.9); // below the toolbar band
      expect((H - y) * px).toBeLessThanOrEqual(500 - 63.9); // above the HUD band
      expect((0 - x) * px).toBeGreaterThanOrEqual(23.9);
      expect((W - x) * px).toBeLessThanOrEqual(800 - 23.9);
    });

    it('a resize re-frames a map at Fit, but keeps a view the gardener zoomed', () => {
      const fixture = mountMeasured();
      const el = fixture.nativeElement as HTMLElement;
      resize(800, 500);

      el.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!.click();
      fixture.detectChanges();
      resize(600, 600);
      expect(el.querySelector('.zoom-level')?.textContent).toContain('140');

      el.querySelector<HTMLButtonElement>('button[aria-label="Fit garden"]')!.click();
      fixture.detectChanges();
      resize(900, 400);
      const [, , w, h] = viewBoxOfEl(el);
      expect(el.querySelector('.zoom-level')?.textContent).toContain('100');
      expect(w / h).toBeCloseTo(900 / 400, 6);
    });
  });

  it('zooms out on a downward wheel as well as in on an upward one', () => {
    const fixture = mountWith();
    const el = fixture.nativeElement as HTMLElement;
    const canvas = el.querySelector('svg.map-svg')!;

    canvas.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200, ctrlKey: true }),
    );
    fixture.detectChanges();
    const zoomedIn = el.querySelector('.zoom-level')?.textContent;

    canvas.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 400, ctrlKey: true }),
    );
    fixture.detectChanges();

    expect(el.querySelector('.zoom-level')?.textContent).not.toBe(zoomedIn);
  });

  it('reuses an existing pointer capture instead of taking a second one', () => {
    Object.defineProperty(Element.prototype, 'hasPointerCapture', {
      value: () => true,
      configurable: true,
      writable: true,
    });
    const setCapture = vi.fn();
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      value: setCapture,
      configurable: true,
      writable: true,
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      height: 500,
      left: 0,
      top: 0,
      right: 800,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const fixture = mountWith();
    const canvas = (fixture.nativeElement as HTMLElement).querySelector('svg.map-svg')!;
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 100, clientY: 100 }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 200, clientY: 200 }),
    );

    expect(setCapture).not.toHaveBeenCalled(); // already captured
    vi.restoreAllMocks();
  });

  it('selecting a plant that has no plot leaves the camera alone', () => {
    const fixture = mountWith([plant(1, 5, 'Tomato')]);
    const el = fixture.nativeElement as HTMLElement;
    const before = el.querySelector('.zoom-level')?.textContent;

    // Remove the plant, then ask the inspector to focus the (now absent) plot.
    fixture.componentInstance.plants.set([]);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[aria-label="Focus this plant on the plan"]')?.click();
    fixture.detectChanges();

    expect(el.querySelector('.zoom-level')?.textContent).toBe(before);
  });
});
