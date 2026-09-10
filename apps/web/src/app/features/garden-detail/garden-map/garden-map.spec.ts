import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Garden, Plant } from '../../../core/api/models';
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
  />`,
})
class Host {
  readonly garden = signal(garden());
  readonly plants = signal<readonly Plant[]>([]);
  added = 0;
  edited: Plant | null = null;
  removed: Plant | null = null;
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
