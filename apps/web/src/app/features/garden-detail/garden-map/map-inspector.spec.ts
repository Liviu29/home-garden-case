import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Garden, Plant } from '../../../core/api/models';
import { WateringConflict } from '../../../shared/utils/garden-planner';
import { MapInspector } from './map-inspector';

const garden = (totalSurfaceArea = 20): Garden => ({
  gardenId: 1,
  gardenName: 'Sunny Backyard',
  totalSurfaceArea,
  targetHumidityLevel: 60,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
});

const plant = (plantId: number, plantName: string, humidity: number, area = 2): Plant => ({
  plantId,
  plantName,
  species: 'Species',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: area,
  idealHumidityLevel: humidity,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

const BASIL = plant(1, 'Basil', 30);
const FERN = plant(2, 'Fern', 85, 3);

const conflict = (a: number, b: number, delta: number): WateringConflict => ({
  a,
  b,
  delta,
  edge: { x1: 1, y1: 0, x2: 1, y2: 1 },
  at: { x: 1, y: 0.5 },
});

@Component({
  imports: [MapInspector],
  template: `<app-map-inspector
    [garden]="garden()"
    [plants]="plants()"
    [plant]="plant()"
    [mutating]="mutating()"
    [deleting]="deleting()"
    [customPosition]="custom()"
    [utilizationPct]="25"
    [freeArea]="15"
    [conflicts]="conflicts()"
    [arrangeBlocked]="blocked()"
    (focusPlant)="log.push('focus')"
    (editPlant)="log.push('edit:' + $event.plantName)"
    (removePlant)="log.push('remove:' + $event.plantName)"
    (clear)="log.push('clear')"
    (returnHome)="log.push('home:' + $event)"
    (arrange)="log.push('arrange')"
    (showZones)="log.push('zones')"
  />`,
})
class Host {
  readonly garden = signal(garden());
  readonly plants = signal<readonly Plant[]>([BASIL, FERN]);
  readonly plant = signal<Plant | null>(null);
  readonly mutating = signal(false);
  readonly deleting = signal(false);
  readonly custom = signal(false);
  readonly conflicts = signal<readonly WateringConflict[]>([]);
  readonly blocked = signal(false);
  readonly log: string[] = [];
}

describe('MapInspector (the planner’s accessible side panel)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let el: HTMLElement;

  const render = () => {
    fixture.detectChanges();
    return el;
  };
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
  });

  describe('garden overview (nothing selected)', () => {
    it('summarises the garden and its watering zones', () => {
      render();
      const text = el.querySelector('.map-inspector')!.textContent ?? '';
      expect(text).toContain('Select a plant on the map');
      expect(text).toContain('25%');
      expect(text).toContain('15 m²');
      const legend = [...el.querySelectorAll('.zones-legend li')].map((li) =>
        li.textContent?.replace(/\s+/g, ' ').trim(),
      );
      expect(legend).toEqual(['Dry 1', 'Balanced 0', 'Humid 1']);
      expect(text).toContain('No watering clashes between neighbours.');
    });

    it('sizes each zone segment by its share of the planted area', () => {
      render();
      const segs = [...el.querySelectorAll<HTMLElement>('.zones-seg')];
      expect(segs.map((s) => s.style.flexGrow)).toEqual(['0.4', '0', '0.6']);
    });

    it('counts clashes, singular and plural', () => {
      host.conflicts.set([conflict(1, 2, 55)]);
      expect(render().textContent).toContain('1 watering clash between neighbouring beds.');
      host.conflicts.set([conflict(1, 2, 55), conflict(2, 3, 30)]);
      expect(render().textContent).toContain('2 watering clashes between neighbouring beds.');
    });

    it('offers to show the zones and to regroup the beds', () => {
      render();
      button('Show on plan')!.click();
      button('Group by water needs')!.click();
      expect(host.log).toEqual(['zones', 'arrange']);
    });

    it('cannot regroup fewer than two beds with a footprint', () => {
      host.plants.set([BASIL, plant(3, 'Seed', 60, 0)]);
      render();
      expect(button('Group by water needs')!.disabled).toBe(true);
    });

    it('explains when no overlap-free grouping exists', () => {
      host.blocked.set(true);
      expect(render().querySelector('.arrange-note')?.textContent).toContain(
        'Not enough open ground',
      );
    });

    it('an empty garden has no zones to show and nothing to regroup', () => {
      host.plants.set([]);
      render();
      expect(el.querySelector('.zones-card')).toBeNull();
      expect(button('Group by water needs')).toBeNull();
    });
  });

  describe('a selected plant', () => {
    beforeEach(() => host.plant.set(BASIL));

    it('shows its facts against the garden', () => {
      const text = render().textContent ?? '';
      expect(el.querySelector('h3')?.textContent).toContain('Basil');
      expect(text).toContain('10% of garden'); // 2 of 20 m²
      expect(text).toContain('-30 vs');
      expect(el.querySelector('.fact-sub.below')).not.toBeNull();
      expect(text).toContain('Dry zone');
    });

    it('marks a plant that wants more water than the target', () => {
      host.plant.set(FERN);
      render();
      expect(el.querySelector('.fact-sub.above')?.textContent).toContain('+25');
      expect(el.querySelector('.zone-chip')?.getAttribute('data-zone')).toBe('humid');
    });

    it('reports 0% of a garden with no surface rather than dividing by zero', () => {
      host.garden.set(garden(0));
      expect(render().textContent).toContain('0% of garden');
    });

    it('says where the bed came from, and offers the way back when the gardener moved it', () => {
      expect(render().textContent).toContain('Auto-placed');
      expect(button('Return to auto spot')).toBeNull();

      host.custom.set(true);
      expect(render().textContent).toContain('Placed by you');
      button('Return to auto spot')!.click();
      expect(host.log).toEqual(['home:1']);
    });

    it('names each neighbour it clashes with on watering, and nothing else', () => {
      host.conflicts.set([conflict(1, 2, 55), conflict(2, 3, 40), conflict(1, 99, 30)]);
      render();
      const lines = [...el.querySelectorAll('.clash-line')].map((p) =>
        p.textContent?.replace(/\s+/g, ' ').trim(),
      );
      // 2–3 does not involve Basil; plant 99 is not in this garden.
      expect(lines).toEqual(['Fern, right next to it, prefers 85% — 55 points apart.']);
    });

    it('has no clash note without conflicts', () => {
      render();
      expect(el.querySelector('.clash-note')).toBeNull();
    });

    it('forwards focus, edit, remove and clear to the owner', () => {
      render();
      el.querySelector<HTMLButtonElement>('[aria-label="Focus this plant on the plan"]')!.click();
      button('Edit')!.click();
      button('Remove')!.click();
      el.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')!.click();
      expect(host.log).toEqual(['focus', 'edit:Basil', 'remove:Basil', 'clear']);
    });

    it('becomes a busy ghost while the plant is being saved or removed', () => {
      host.mutating.set(true);
      render();
      const aside = el.querySelector('.map-inspector')!;
      expect(aside.getAttribute('aria-busy')).toBe('true');
      expect(el.querySelector('.inspector-ghost')).not.toBeNull();
      expect(aside.textContent).toContain('Saving changes to Basil');

      host.deleting.set(true);
      expect(render().querySelector('.map-inspector')!.textContent).toContain('Removing Basil');
    });
  });
});
