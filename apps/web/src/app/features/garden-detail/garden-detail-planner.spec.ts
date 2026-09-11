import { TestBed } from '@angular/core/testing';
import { DeferBlockBehavior } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { Garden, Plant } from '../../core/api/models';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { GardenDetail } from './garden-detail';
import { GardenDetailStore } from './garden-detail-store/garden-detail-store';
import { GardenLayoutRepository } from './garden-map/garden-layout-repository/garden-layout-repository';

/**
 * The detail screen's planner wiring and plants-table extras: one-bed resets
 * and whole arrangements as undoable steps, table sorting, planting ages,
 * watering-zone dots and plant-derived header ghosts. (The closing garden
 * photo moved to the shell, so every page ends with it — see shell.spec.)
 */

const CONFIG = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 1, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  toastDurationMs: 5000,
} as AppConfig;

const GARDEN: Garden = {
  gardenId: 1,
  gardenName: 'Backyard Beds',
  totalSurfaceArea: 20,
  targetHumidityLevel: 60,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

const plant = (plantId: number, plantName: string, over: Partial<Plant> = {}): Plant => ({
  plantId,
  plantName,
  species: 'Species',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: 5,
  idealHumidityLevel: 70,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const PLANTS = [
  plant(11, 'Tomato', { surfaceAreaRequired: 6, idealHumidityLevel: 40 }),
  plant(12, 'Basil', {
    surfaceAreaRequired: 2,
    idealHumidityLevel: 85,
    plantationDate: '2026-05-02T00:00:00.000Z',
  }),
  plant(13, 'Chard', {
    surfaceAreaRequired: 4,
    idealHumidityLevel: 60,
    plantationDate: '2026-03-15T00:00:00.000Z',
  }),
];

type Vm = {
  positions: () => Record<number, { x: number; y: number }>;
  canUndo: () => boolean;
  onPositionChange: (m: { plantId: number; x: number; y: number }) => void;
  onResetPosition: (id: number) => void;
  onArrange: (next: Record<number, { x: number; y: number }>) => void;
  undoLayout: () => void;
  sortBy: (key: 'name' | 'planted' | 'area' | 'humidity') => void;
  ariaSort: (key: 'name' | 'planted' | 'area' | 'humidity') => string | null;
  sortedPlants: () => readonly Plant[];
  plantedAgo: (p: Plant) => string;
  zoneOf: (p: Plant) => string;
};

describe('GardenDetail — planner wiring and plants-table extras', () => {
  let plantsApi: { getByGarden: ReturnType<typeof vi.fn> };

  const render = () => {
    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: CONFIG },
        { provide: GardensApi, useValue: { getById: vi.fn().mockResolvedValue(GARDEN) } },
        { provide: PlantsApi, useValue: plantsApi },
        { provide: MatDialog, useValue: { open: vi.fn(() => ({ afterClosed: () => of(false) })) } },
        { provide: ConfirmService, useValue: { confirm: vi.fn().mockResolvedValue(false) } },
      ],
    });
    const fixture = TestBed.createComponent(GardenDetail);
    fixture.componentRef.setInput('gardenId', 1);
    fixture.detectChanges();
    return {
      fixture,
      vm: fixture.componentInstance as unknown as Vm,
      store: fixture.debugElement.injector.get(GardenDetailStore),
      repo: TestBed.inject(GardenLayoutRepository),
      el: fixture.nativeElement as HTMLElement,
    };
  };

  const loaded = async () => {
    const r = render();
    await vi.waitFor(() => expect(r.store.plantsStatus()).toBe('ready'));
    r.fixture.detectChanges();
    return r;
  };

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = (): void => undefined;
        unobserve = (): void => undefined;
        disconnect = (): void => undefined;
        takeRecords = (): [] => [];
        root = null;
        rootMargin = '';
        thresholds = [];
      },
    );
    plantsApi = { getByGarden: vi.fn().mockResolvedValue(PLANTS) };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('layout history', () => {
    it('returns one bed to its automatic spot as an undoable step, persisted', async () => {
      const { vm, repo } = await loaded();
      vm.onPositionChange({ plantId: 11, x: 2, y: 3 });
      vm.onPositionChange({ plantId: 12, x: 1, y: 1 });

      vm.onResetPosition(11);
      expect(vm.positions()).toEqual({ 12: { x: 1, y: 1 } });
      expect(repo.load(1)).toEqual({ 12: { x: 1, y: 1 } });

      vm.undoLayout();
      expect(vm.positions()[11]).toEqual({ x: 2, y: 3 });
    });

    it('a reset for a bed that was never moved is not a step at all', async () => {
      const { vm } = await loaded();
      vm.onResetPosition(11);
      expect(vm.canUndo()).toBe(false);
    });

    it('commits a whole arrangement as ONE undoable step', async () => {
      const { vm } = await loaded();
      vm.onArrange({ 11: { x: 0, y: 0 }, 12: { x: 3, y: 0 }, 13: { x: 3, y: 1 } });
      expect(Object.keys(vm.positions())).toHaveLength(3);
      vm.undoLayout();
      expect(vm.positions()).toEqual({});
      expect(vm.canUndo()).toBe(false);
    });
  });

  describe('plants table sorting', () => {
    const names = (vm: Vm) => vm.sortedPlants().map((p) => p.plantName);

    it('keeps the store order until a column is chosen', async () => {
      const { vm } = await loaded();
      expect(names(vm)).toEqual(['Tomato', 'Basil', 'Chard']);
      expect(vm.ariaSort('name')).toBeNull();
    });

    it('names sort A→Z first, then Z→A, then back to the original order', async () => {
      const { vm } = await loaded();
      vm.sortBy('name');
      expect(names(vm)).toEqual(['Basil', 'Chard', 'Tomato']);
      expect(vm.ariaSort('name')).toBe('ascending');
      vm.sortBy('name');
      expect(names(vm)).toEqual(['Tomato', 'Chard', 'Basil']);
      expect(vm.ariaSort('name')).toBe('descending');
      vm.sortBy('name');
      expect(names(vm)).toEqual(['Tomato', 'Basil', 'Chard']);
    });

    it('numbers and dates sort largest / newest first', async () => {
      const { vm } = await loaded();
      vm.sortBy('area');
      expect(names(vm)).toEqual(['Tomato', 'Chard', 'Basil']);
      vm.sortBy('humidity');
      expect(names(vm)).toEqual(['Basil', 'Chard', 'Tomato']);
      expect(vm.ariaSort('area')).toBeNull();
      vm.sortBy('planted');
      expect(names(vm)).toEqual(['Basil', 'Tomato', 'Chard']);
    });

    it('ties keep a stable order by id', async () => {
      plantsApi.getByGarden.mockResolvedValue([
        plant(21, 'B', { surfaceAreaRequired: 2 }),
        plant(20, 'A', { surfaceAreaRequired: 2 }),
      ]);
      const { vm } = await loaded();
      vm.sortBy('area');
      expect(vm.sortedPlants().map((p) => p.plantId)).toEqual([21, 20]); // desc: id reversed
    });

    it('the header buttons sort and announce the order', async () => {
      const { fixture, el } = await loaded();
      const header = () =>
        [...el.querySelectorAll('th')].find((th) => th.textContent?.includes('Area'))!;
      header().querySelector('button')!.click();
      fixture.detectChanges();
      expect(header().getAttribute('aria-sort')).toBe('descending');
      expect(header().querySelector('.sort-icon')?.textContent?.trim()).toBe('↓');
      const firstRow = el.querySelector('tbody tr .plant-name')?.textContent;
      expect(firstRow).toContain('Tomato');
    });
  });

  describe('planting age and watering zone', () => {
    it('says how long each plant has been in the ground', async () => {
      const { vm } = await loaded();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-04-11T12:00:00.000Z'));
      const at = (date: string) => vm.plantedAgo(plant(1, 'P', { plantationDate: date }));
      expect(at('2026-04-11T01:00:00.000Z')).toBe('Today');
      expect(at('2026-04-10T01:00:00.000Z')).toBe('Yesterday');
      expect(at('2026-04-06T01:00:00.000Z')).toBe('5 days ago');
      expect(at('2026-03-01T01:00:00.000Z')).toBe('6 weeks ago');
      expect(at('2025-12-01T01:00:00.000Z')).toBe('4 months ago');
      expect(at('2023-01-01T01:00:00.000Z')).toBe('3 years ago');
      expect(at('2026-04-12T01:00:00.000Z')).toBe('Tomorrow');
      expect(at('2026-04-20T01:00:00.000Z')).toBe('In 9 days');
      expect(at('not a date')).toBe('');
    });

    it('counts calendar days where the viewer is, not in UTC', async () => {
      const { vm } = await loaded();
      const env = (
        globalThis as unknown as { process: { env: Record<string, string | undefined> } }
      ).process.env;
      const tz = env['TZ'];
      env['TZ'] = 'Europe/Bucharest';
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        // 01:30 on 11 September in Bucharest — still 10 September in UTC.
        vi.setSystemTime(new Date('2026-09-10T22:30:00.000Z'));
        const at = (date: string) => vm.plantedAgo(plant(1, 'P', { plantationDate: date }));
        expect(at('2026-09-11T00:00:00.000Z')).toBe('Today'); // said "Tomorrow"
        expect(at('2026-09-10T00:00:00.000Z')).toBe('Yesterday');
        expect(at('2026-09-12T00:00:00.000Z')).toBe('Tomorrow');
      } finally {
        vi.useRealTimers();
        if (tz === undefined) {
          delete env['TZ'];
        } else {
          env['TZ'] = tz;
        }
      }
    });

    it('marks each row with its watering zone', async () => {
      const { vm, el } = await loaded();
      expect(PLANTS.map((p) => vm.zoneOf(p))).toEqual(['dry', 'humid', 'balanced']);
      const dots = [...el.querySelectorAll('td .zone-dot')].map((d) => d.getAttribute('data-zone'));
      expect(dots).toEqual(['dry', 'humid', 'balanced']);
      expect(el.querySelector('.humidity-cell')?.getAttribute('title')).toBe('Dry watering zone');
    });
  });

  describe('while the plants are still on their way', () => {
    it('ghosts every plant-derived number in the header — never a fake zero', async () => {
      plantsApi.getByGarden.mockReturnValue(new Promise(() => undefined));
      const { fixture, store, el } = render();
      await vi.waitFor(() => expect(store.garden()).not.toBeNull());
      fixture.detectChanges();

      const header = el.querySelector('header.detail-header')!;
      expect(header.getAttribute('aria-busy')).toBe('true');
      expect(header.querySelectorAll('app-skeleton').length).toBeGreaterThanOrEqual(5);
      expect(header.querySelector('.stat-value')).toBeNull();
      expect(header.querySelector('app-humidity-gauge')).toBeNull();
      expect(header.querySelector('app-capacity-status')).toBeNull();
      expect(header.textContent).toContain('m² used'); // the labels are real
    });

    it('shows the real numbers once they land', async () => {
      const { el } = await loaded();
      const header = el.querySelector('header.detail-header')!;
      expect(header.getAttribute('aria-busy')).toBeNull();
      expect(header.querySelectorAll('.stat-value').length).toBe(3);
      expect(header.querySelector('app-humidity-gauge')).not.toBeNull();
    });
  });
});
