import { Title } from '@angular/platform-browser';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatMenuHarness } from '@angular/material/menu/testing';
import {
  type ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import type { Garden, Plant } from '../../core/api/models';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { APP_CONFIG, type AppConfig } from '../../core/config/app-config';
import { ApiError } from '../../core/errors/api-error';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { GardenDetail } from './garden-detail';
import { GardenDetailStore } from './garden-detail-store/garden-detail-store';
import { GardenLayoutRepository } from '../../state/garden-layout/garden-layout-repository';

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

const plant = (plantId: number, plantName: string, species = 'Solanum'): Plant => ({
  plantId,
  plantName,
  species,
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: 5,
  idealHumidityLevel: 70,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

const PLANTS = [plant(11, 'Tomato'), plant(12, 'Basil', 'Ocimum')];

type DetailApi = {
  selectedPlantId: { (): number | null; set: (v: number | null) => void };
  positions: { (): Record<number, { x: number; y: number }> };
  canUndo: () => boolean;
  canRedo: () => boolean;
  hasCustomLayout: () => boolean;
  plannerFullscreen: () => boolean;
  plannerQuery: { (): string; set: (v: string) => void };
  onPlannerQueryInput: (e: Event) => void;
  retryGarden: () => void;
  openEditGarden: (g: Garden) => void;
  openPlantForm: (p: Plant | null) => void;
  removePlant: (p: Plant) => Promise<void>;
  humidityDeltaOf: (p: Plant, g: Garden) => number;
  selectOnMap: (p: Plant) => void;
  isMutating: (id: number) => boolean;
  gardenUpdating: (id: number) => boolean;
  onPositionChange: (m: { plantId: number; x: number; y: number }) => void;
  undoLayout: () => void;
  redoLayout: () => void;
  resetLayout: () => Promise<void>;
  toggleFullscreen: () => void;
  focusSearchMatch: () => void;
};

describe('GardenDetail', () => {
  let gardensApi: Record<string, ReturnType<typeof vi.fn>>;
  let plantsApi: Record<string, ReturnType<typeof vi.fn>>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let confirm: { confirm: ReturnType<typeof vi.fn> };
  let afterClosed: ReturnType<typeof vi.fn>;

  const render = (gardenId: unknown = 1) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      // The Garden Map lives behind `@defer (on viewport)`, and jsdom never
      // fires an intersection. Manual behaviour lets a test render the block
      // explicitly, which is the only deterministic way to reach the map's
      // bindings from a unit test.
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        { provide: PlantsApi, useValue: plantsApi },
        { provide: MatDialog, useValue: dialog },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    const fixture = TestBed.createComponent(GardenDetail);
    fixture.componentRef.setInput('gardenId', gardenId);
    fixture.detectChanges();
    return {
      fixture,
      vm: fixture.componentInstance as unknown as DetailApi,
      store: fixture.debugElement.injector.get(GardenDetailStore),
      repo: TestBed.inject(GardenLayoutRepository),
      el: fixture.nativeElement as HTMLElement,
    };
  };

  const settled = async (store: InstanceType<typeof GardenDetailStore>) =>
    vi.waitFor(() => expect(store.garden()).not.toBeNull());

  beforeEach(() => {
    localStorage.clear();
    document.body.style.overflow = '';
    // jsdom ships no IntersectionObserver, which `@defer (on viewport)` asks
    // for. Stubbing it keeps the component under test rather than the polyfill.
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
    gardensApi = { getById: vi.fn().mockResolvedValue(GARDEN) };
    plantsApi = { getByGarden: vi.fn().mockResolvedValue(PLANTS) };
    afterClosed = vi.fn().mockReturnValue(of(false));
    dialog = { open: vi.fn().mockReturnValue({ afterClosed }) };
    confirm = { confirm: vi.fn().mockResolvedValue(false) };
  });

  describe('route input', () => {
    it('loads the garden named by the route', async () => {
      const { store } = render(1);
      await settled(store);
      expect(gardensApi['getById']).toHaveBeenCalledWith(1);
    });

    it.each([0, -1, 1.5, Number.NaN])(
      'shows the not-found state for the malformed id %s WITHOUT issuing a request',
      (id) => {
        const { store } = render(id);
        expect(store.gardenMissing()).toBe(true);
        expect(gardensApi['getById']).not.toHaveBeenCalled();
      },
    );

    it('refines the document title once the garden name is known', async () => {
      const { store } = render(1);
      await settled(store);
      TestBed.tick();
      expect(TestBed.inject(Title).getTitle()).toBe('Backyard Beds · HomeGarden');
    });

    it('retryGarden re-issues the read for a valid id', async () => {
      const { vm, store } = render(1);
      await settled(store);
      // Assert the component's responsibility — asking the store to load.
      // Whether that reaches the network is the SWR cache's decision, and
      // inside the TTL it correctly will not.
      const load = vi.spyOn(store, 'load');

      vm.retryGarden();
      expect(load).toHaveBeenCalledWith(1);
    });

    it('retryGarden does nothing for a malformed id', () => {
      const { vm } = render('abc');
      gardensApi['getById'].mockClear();
      vm.retryGarden();
      expect(gardensApi['getById']).not.toHaveBeenCalled();
    });
  });

  describe('selection', () => {
    it('selects a plant, and selecting the same one again clears it', async () => {
      const { vm, store } = render();
      await settled(store);

      vm.selectOnMap(PLANTS[0]);
      expect(vm.selectedPlantId()).toBe(11);
      vm.selectOnMap(PLANTS[0]);
      expect(vm.selectedPlantId()).toBeNull();
    });
  });

  describe('dialogs', () => {
    it('opens the garden edit dialog and reloads only when something was saved', async () => {
      const { vm, store } = render();
      await settled(store);
      const load = vi.spyOn(store, 'load');

      afterClosed.mockReturnValue(of(false));
      vm.openEditGarden(GARDEN);
      expect(load).not.toHaveBeenCalled(); // dismissed — nothing to pick up

      afterClosed.mockReturnValue(of(true));
      vm.openEditGarden(GARDEN);
      expect(load).toHaveBeenCalledWith(1);
    });

    it('does not open the plant form before the garden has loaded', () => {
      const { vm } = render();
      vm.openPlantForm(null);
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('opens the plant form with the garden and its plants', async () => {
      const { vm, store } = render();
      await settled(store);
      await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

      vm.openPlantForm(null);

      expect(dialog.open).toHaveBeenCalledOnce();
      const data = dialog.open.mock.calls[0][1].data;
      expect(data.garden).toMatchObject({ gardenId: 1 });
      expect(data.plants).toHaveLength(2);
      expect(data.plant).toBeNull();
    });

    it('selects a newly created plant so the map centres it', async () => {
      const { vm, store } = render();
      await settled(store);
      vi.spyOn(store, 'lastCreatedPlantId').mockReturnValue(99);
      afterClosed.mockReturnValue(of(true));

      vm.openPlantForm(null);

      expect(vm.selectedPlantId()).toBe(99);
    });

    it('does NOT change selection after an edit (only a create)', async () => {
      const { vm, store } = render();
      await settled(store);
      vi.spyOn(store, 'lastCreatedPlantId').mockReturnValue(99);
      afterClosed.mockReturnValue(of(true));

      vm.openPlantForm(PLANTS[0]); // editing, not creating

      expect(vm.selectedPlantId()).toBeNull();
    });
  });

  describe('removePlant', () => {
    it('asks first and does nothing when declined', async () => {
      const { vm, store } = render();
      await settled(store);
      const remove = vi.spyOn(store, 'removePlant');

      await vm.removePlant(PLANTS[0]);

      expect(confirm.confirm).toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('removes once confirmed', async () => {
      const { vm, store } = render();
      await settled(store);
      const remove = vi.spyOn(store, 'removePlant').mockResolvedValue(undefined);
      confirm.confirm.mockResolvedValue(true);

      await vm.removePlant(PLANTS[0]);

      expect(remove).toHaveBeenCalledWith(PLANTS[0]);
    });
  });

  describe('planner layout (browser-local visual state)', () => {
    it('records a move, enables undo, and persists it', async () => {
      const { vm, store, repo } = render();
      await settled(store);
      await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

      vm.onPositionChange({ plantId: 11, x: 2, y: 3 });

      expect(vm.positions()[11]).toEqual({ x: 2, y: 3 });
      expect(vm.canUndo()).toBe(true);
      expect(vm.hasCustomLayout()).toBe(true);
      expect(repo.load(1)).toEqual({ 11: { x: 2, y: 3 } });
    });

    it('undo restores the previous arrangement and enables redo', async () => {
      const { vm, store } = render();
      await settled(store);

      vm.onPositionChange({ plantId: 11, x: 2, y: 3 });
      vm.undoLayout();

      expect(vm.positions()).toEqual({});
      expect(vm.canUndo()).toBe(false);
      expect(vm.canRedo()).toBe(true);
    });

    it('redo reapplies it', async () => {
      const { vm, store } = render();
      await settled(store);

      vm.onPositionChange({ plantId: 11, x: 2, y: 3 });
      vm.undoLayout();
      vm.redoLayout();

      expect(vm.positions()[11]).toEqual({ x: 2, y: 3 });
      expect(vm.canRedo()).toBe(false);
    });

    it('undo and redo are no-ops at the ends of the stack', async () => {
      const { vm, store } = render();
      await settled(store);

      expect(() => vm.undoLayout()).not.toThrow();
      expect(() => vm.redoLayout()).not.toThrow();
      expect(vm.positions()).toEqual({});
    });

    it('a new move clears the redo branch', async () => {
      const { vm, store } = render();
      await settled(store);

      vm.onPositionChange({ plantId: 11, x: 1, y: 1 });
      vm.undoLayout();
      expect(vm.canRedo()).toBe(true);

      vm.onPositionChange({ plantId: 12, x: 4, y: 4 });
      expect(vm.canRedo()).toBe(false);
    });

    it('bounds the history at 20 entries so a long session cannot grow forever', async () => {
      const { vm, store } = render();
      await settled(store);

      for (let i = 0; i < 30; i++) {
        vm.onPositionChange({ plantId: 11, x: i, y: i });
      }
      let undos = 0;
      while (vm.canUndo() && undos < 100) {
        vm.undoLayout();
        undos++;
      }
      expect(undos).toBe(20);
    });

    it('reset does nothing when the layout is already automatic', async () => {
      const { vm, store } = render();
      await settled(store);

      await vm.resetLayout();

      expect(confirm.confirm).not.toHaveBeenCalled();
    });

    it('reset asks first, and keeps the layout when declined', async () => {
      const { vm, store } = render();
      await settled(store);
      vm.onPositionChange({ plantId: 11, x: 2, y: 3 });

      await vm.resetLayout();

      expect(confirm.confirm).toHaveBeenCalled();
      expect(vm.positions()[11]).toEqual({ x: 2, y: 3 });
    });

    it('reset clears positions and storage once confirmed, and is itself undoable', async () => {
      const { vm, store, repo } = render();
      await settled(store);
      vm.onPositionChange({ plantId: 11, x: 2, y: 3 });
      confirm.confirm.mockResolvedValue(true);

      await vm.resetLayout();

      expect(vm.positions()).toEqual({});
      expect(repo.load(1)).toEqual({});
      expect(vm.canUndo()).toBe(true);
    });

    it('restores a persisted layout when the garden loads', async () => {
      TestBed.resetTestingModule();
      const seeded = new GardenLayoutRepository();
      seeded.save(1, { 11: { x: 7, y: 8 } }, [11]);

      const { vm, store } = render();
      await settled(store);

      expect(vm.positions()[11]).toEqual({ x: 7, y: 8 });
    });
  });

  describe('fullscreen planner', () => {
    it('toggles and locks page scroll behind the overlay', async () => {
      const { vm, store } = render();
      await settled(store);

      vm.toggleFullscreen();
      expect(vm.plannerFullscreen()).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');

      vm.toggleFullscreen();
      expect(vm.plannerFullscreen()).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });

    it('gives the page its scroll back when the screen is left while fullscreen', async () => {
      const { vm, store, fixture } = render();
      await settled(store);
      vm.toggleFullscreen();
      expect(document.body.style.overflow).toBe('hidden');

      fixture.destroy(); // Back, or a deep link elsewhere

      expect(document.body.style.overflow).toBe('');
    });

    it('traps focus in the planner while fullscreen, like a dialog', async () => {
      const { vm, store, fixture, el } = render();
      await settled(store);
      fixture.detectChanges();
      // The CDK puts two anchors around the trapped panel; they are live
      // (tabbable, and they bounce focus back inside) only while enabled.
      const anchors = () => [...el.querySelectorAll('.cdk-focus-trap-anchor')];

      vm.toggleFullscreen();
      fixture.detectChanges();
      expect(anchors()).toHaveLength(2);
      expect(anchors().every((a) => a.getAttribute('tabindex') === '0')).toBe(true);

      vm.toggleFullscreen();
      fixture.detectChanges();
      expect(anchors()).toHaveLength(2); // still there, dormant
      expect(anchors().every((a) => !a.hasAttribute('tabindex'))).toBe(true);
    });

    it('Escape in the panel’s search leaves fullscreen; inside the map, the map decides', async () => {
      const { vm, store, fixture, el } = render();
      await settled(store);
      fixture.detectChanges();
      const escape = (target: Element) =>
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      vm.toggleFullscreen();
      fixture.detectChanges();
      escape(el.querySelector('.planner-search')!);
      fixture.detectChanges();
      expect(vm.plannerFullscreen()).toBe(false);

      // From inside the map the event is the map's (its own cascade decides
      // what Escape means there); the panel leaves it alone.
      vm.toggleFullscreen();
      fixture.detectChanges();
      const blocks = await fixture.getDeferBlocks();
      await blocks[0].render(DeferBlockState.Complete);
      fixture.detectChanges();
      escape(el.querySelector('app-garden-map')!);
      fixture.detectChanges();
      expect(vm.plannerFullscreen()).toBe(true);
    });

    it('moves focus into the search when it opens, and back to the opener when it closes', async () => {
      const { vm, store, fixture, el } = render();
      await settled(store);
      fixture.detectChanges();
      const opener = el.querySelector<HTMLButtonElement>('button')!;
      opener.focus();
      expect(document.activeElement).toBe(opener);

      vm.toggleFullscreen();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(el.querySelector('.planner-search'));

      vm.toggleFullscreen();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(opener);
    });
  });

  describe('fullscreen search', () => {
    it('reads the query from a native input event', async () => {
      const { vm, store } = render();
      await settled(store);

      const input = document.createElement('input');
      input.value = 'tom';
      vm.onPlannerQueryInput({ target: input } as unknown as Event);

      expect(vm.plannerQuery()).toBe('tom');
    });

    it('does nothing on an empty query', async () => {
      const { vm, store } = render();
      await settled(store);

      vm.plannerQuery.set('   ');
      vm.focusSearchMatch();

      expect(vm.selectedPlantId()).toBeNull();
    });

    it('selects the first plant matching by name', async () => {
      const { vm, store } = render();
      await settled(store);
      await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

      vm.plannerQuery.set('TOM');
      vm.focusSearchMatch();

      expect(vm.selectedPlantId()).toBe(11);
    });

    it('matches on species too', async () => {
      const { vm, store } = render();
      await settled(store);
      await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

      vm.plannerQuery.set('ocimum');
      vm.focusSearchMatch();

      expect(vm.selectedPlantId()).toBe(12);
    });

    it('leaves the selection alone when nothing matches', async () => {
      const { vm, store } = render();
      await settled(store);
      await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

      vm.plannerQuery.set('zzz');
      vm.focusSearchMatch();

      expect(vm.selectedPlantId()).toBeNull();
    });
  });

  describe('row state helpers', () => {
    it('reports a plant as mutating while a delete or update is pending', async () => {
      const { vm, store } = render();
      await settled(store);
      vi.spyOn(store, 'pendingDeletes').mockReturnValue([11]);

      expect(vm.isMutating(11)).toBe(true);
      expect(vm.isMutating(12)).toBe(false);
    });

    it('computes the per-plant humidity delta from the domain module', async () => {
      const { vm, store } = render();
      await settled(store);
      expect(vm.humidityDeltaOf(PLANTS[0], GARDEN)).toBe(10); // 70 ideal − 60 target
    });

    it('reports the garden as updating from the gardens store', async () => {
      const { vm, store } = render();
      await settled(store);
      expect(vm.gardenUpdating(1)).toBe(false);
    });
  });

  describe('rendered states', () => {
    const settle = async (fixture: { detectChanges: () => void }, store: unknown) => {
      await vi.waitFor(() => expect((store as { garden: () => unknown }).garden()).not.toBeNull());
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    };

    it('renders the designed not-found state for a malformed deep link', () => {
      const { fixture, el } = render('abc');
      fixture.detectChanges();
      expect(el.textContent).toContain('Garden not found');
      expect(el.querySelector('h1')?.textContent).toContain('Garden not found');
    });

    it('renders a retry state — not a lie — when the read fails transiently', async () => {
      gardensApi['getById'].mockRejectedValue(new ApiError('technical', 'boom', 500));
      const { fixture, store, el } = render(1);
      await vi.waitFor(() => expect(store.gardenFailed()).toBe(true));
      fixture.detectChanges();

      expect(el.textContent).toContain("Couldn't load this garden");
      expect(el.textContent).toContain('still there');
    });

    it('renders the cold-load skeleton before anything arrives', async () => {
      gardensApi['getById'].mockReturnValue(new Promise(() => undefined));
      const { fixture, el } = render(1);
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      expect(el.querySelectorAll('app-skeleton').length).toBeGreaterThan(0);
    });

    it('renders the header, the plan and the plant table once loaded', async () => {
      const { fixture, store, el } = render(1);
      await settle(fixture, store);

      expect(el.querySelector('h1')?.textContent).toContain('Backyard Beds');
      expect(el.textContent).toContain('Garden plan');
      expect(el.textContent).toContain('Plants');
      expect(el.textContent).toContain('Tomato');
    });

    it('renders the location line only when the garden has one', async () => {
      gardensApi['getById'].mockResolvedValue({ ...GARDEN, locationDescription: 'by the shed' });
      const { fixture, store, el } = render(1);
      await settle(fixture, store);

      expect(el.textContent).toContain('by the shed');
    });

    it('renders the designed empty state when the garden has no plants', async () => {
      plantsApi['getByGarden'].mockResolvedValue([]);
      const { fixture, store, el } = render(1);
      await settle(fixture, store);
      await vi.waitFor(() => expect(store.plantsEmpty()).toBe(true));
      fixture.detectChanges();

      expect(el.textContent).toContain('Nothing planted yet');
    });

    it('renders a plant row as a ghost while its mutation is pending', async () => {
      const { fixture, store, el } = render(1);
      await settle(fixture, store);
      await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

      const rowsBefore = el.querySelectorAll('tbody tr').length;
      expect(rowsBefore).toBeGreaterThan(0);
    });

    it('renders the fullscreen planner chrome when toggled', async () => {
      const { fixture, vm, store, el } = render(1);
      await settle(fixture, store);

      vm.toggleFullscreen();
      fixture.detectChanges();

      expect(el.querySelector('input[type="search"], .planner-search')).not.toBeNull();
    });

    it('renders the humidity drift note when plants disagree with the target', async () => {
      const { fixture, store, el } = render(1);
      await settle(fixture, store);
      await vi.waitFor(() => expect(store.plants()).toHaveLength(2));
      fixture.detectChanges();

      // Both fixture plants want 70% against a 60% target — a real drift.
      expect(store.humidityDrift()).not.toBeNull();
      expect(el.textContent).toMatch(/humidity/i);
    });
  });

  /**
   * Driven through the rendered DOM. The detail screen wires the planner, the
   * plant table and the dialogs together, and every one of those connections
   * is a template binding that method-level tests cannot see.
   */
  describe('wired interactions', () => {
    const loaded = async () => {
      const rendered = render(1);
      await vi.waitFor(() => expect(rendered.store.garden()).not.toBeNull());
      await vi.waitFor(() => expect(rendered.store.plants()).toHaveLength(2));
      rendered.fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      rendered.fixture.detectChanges();
      return rendered;
    };

    const buttonWith = (el: HTMLElement, text: RegExp) =>
      [...el.querySelectorAll('button')].find((b) => text.test(b.textContent ?? ''));

    it('the retry button on a failed read asks the store to load again', async () => {
      gardensApi['getById'].mockRejectedValue(new ApiError('technical', 'boom', 500));
      const { fixture, store, el } = render(1);
      await vi.waitFor(() => expect(store.gardenFailed()).toBe(true));
      fixture.detectChanges();
      const load = vi.spyOn(store, 'load');

      buttonWith(el, /try again/i)?.click();

      expect(load).toHaveBeenCalledWith(1);
    });

    it('the Add plant button opens the plant form', async () => {
      const { el } = await loaded();

      buttonWith(el, /add plant/i)?.click();

      expect(dialog.open).toHaveBeenCalled();
    });

    it('Edit garden, behind the garden actions menu, opens the garden form', async () => {
      const { fixture } = await loaded();

      const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(
        MatMenuHarness.with({ selector: '[aria-label="Garden actions"]' }),
      );
      await menu.open();
      await (await menu.getItems({ text: /edit garden/i }))[0].click();

      expect(dialog.open).toHaveBeenCalled();
    });

    it('Remove, behind the plant actions menu, asks for confirmation first', async () => {
      const { fixture } = await loaded();

      const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(
        MatMenuHarness.with({ selector: '[aria-label="Plant actions"]' }),
      );
      await menu.open();
      await (await menu.getItems({ text: /^\s*Remove\s*$/ }))[0].click();
      await Promise.resolve();

      expect(confirm.confirm).toHaveBeenCalled();
    });

    it('Edit, behind the plant actions menu, opens the plant form', async () => {
      const { fixture } = await loaded();

      const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(
        MatMenuHarness.with({ selector: '[aria-label="Plant actions"]' }),
      );
      await menu.open();
      await (await menu.getItems({ text: /^\s*Edit\s*$/ }))[0].click();

      expect(dialog.open).toHaveBeenCalled();
    });

    it('the planner search input updates the query and Enter focuses a match', async () => {
      const { fixture, vm, el } = await loaded();
      vm.toggleFullscreen();
      fixture.detectChanges();

      const search = el.querySelector<HTMLInputElement>('input[type="search"]');
      expect(search).not.toBeNull();
      search!.value = 'Tomato';
      search!.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();

      expect(vm.plannerQuery()).toBe('Tomato');

      search!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();

      expect(vm.selectedPlantId()).toBe(11);
    });

    const renderMap = async (fixture: ComponentFixture<GardenDetail>) => {
      const blocks = await fixture.getDeferBlocks();
      await blocks[0].render(DeferBlockState.Complete);
      fixture.detectChanges();
    };

    it('renders the deferred Garden Map and wires its outputs to the screen', async () => {
      const { fixture, vm, el } = await loaded();
      await renderMap(fixture);

      const map = el.querySelector('app-garden-map');
      expect(map, 'the deferred map should have rendered').not.toBeNull();

      // Drive the map's own controls: each one is an output binding on the
      // detail template that would otherwise never be exercised.
      el.querySelector<HTMLButtonElement>('button[title="Zoom in"]')?.click();
      el.querySelector<HTMLButtonElement>('button[title="Undo layout move"]')?.click();
      el.querySelector<HTMLButtonElement>('button[title="Redo layout move"]')?.click();
      el.querySelector<HTMLButtonElement>(
        'button[title="Reset layout to automatic arrangement"]',
      )?.click();
      el.querySelector<HTMLButtonElement>('[aria-label="Expand planner"]')?.click();
      fixture.detectChanges();

      expect(vm.plannerFullscreen()).toBe(true);
    });

    it('selecting a plot on the map selects it on the screen', async () => {
      const { fixture, vm, el } = await loaded();
      await renderMap(fixture);

      const plot = el.querySelector<SVGGElement>('g.plot');
      plot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();

      expect(vm.selectedPlantId()).not.toBeNull();
    });

    it('the map Add-plant invitation opens the plant form on an empty garden', async () => {
      plantsApi['getByGarden'].mockResolvedValue([]);
      const rendered = render(1);
      await vi.waitFor(() => expect(rendered.store.garden()).not.toBeNull());
      await vi.waitFor(() => expect(rendered.store.plantsEmpty()).toBe(true));
      rendered.fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      rendered.fixture.detectChanges();

      buttonWith(rendered.el, /Add your first plant/)!.click();

      expect(dialog.open).toHaveBeenCalled();
    });

    it('answers every intent the deferred map raises', async () => {
      const { fixture, vm } = await loaded();
      await renderMap(fixture);
      type Emits<T = void> = { emit: (value: T) => void };
      const map = fixture.debugElement.query((de) => de.name === 'app-garden-map')
        .componentInstance as {
        addPlant: Emits;
        editPlant: Emits<Plant>;
        removePlant: Emits<Plant>;
        positionChange: Emits<{ plantId: number; x: number; y: number }>;
        resetPosition: Emits<number>;
        arrangePositions: Emits<Record<number, { x: number; y: number }>>;
        undoLayout: Emits;
        redoLayout: Emits;
        resetLayout: Emits;
      };

      map.positionChange.emit({ plantId: 11, x: 1, y: 1 });
      expect(vm.positions()[11]).toEqual({ x: 1, y: 1 });
      expect(vm.canUndo()).toBe(true);

      map.undoLayout.emit();
      expect(vm.positions()[11]).toBeUndefined();
      map.redoLayout.emit();
      expect(vm.positions()[11]).toEqual({ x: 1, y: 1 });

      map.resetPosition.emit(11);
      expect(vm.positions()[11]).toBeUndefined();

      map.arrangePositions.emit({ 11: { x: 2, y: 0 }, 12: { x: 0, y: 0 } });
      expect(vm.positions()[12]).toEqual({ x: 0, y: 0 });

      map.resetLayout.emit();
      await vi.waitFor(() => expect(confirm.confirm).toHaveBeenCalledTimes(1));

      map.addPlant.emit();
      map.editPlant.emit(PLANTS[0]);
      expect(dialog.open).toHaveBeenCalledTimes(2);

      map.removePlant.emit(PLANTS[1]);
      await vi.waitFor(() => expect(confirm.confirm).toHaveBeenCalledTimes(2));
    });

    it('offers Try again on the plan and on the table when the plants fail, and retries', async () => {
      plantsApi['getByGarden'].mockRejectedValue(new ApiError('technical', 'boom', 500));
      const rendered = render(1);
      await vi.waitFor(() => expect(rendered.store.plantsFailed()).toBe(true));
      rendered.fixture.detectChanges();

      const retries = [...rendered.el.querySelectorAll('button')].filter((b) =>
        /Try again/.test(b.textContent ?? ''),
      );
      expect(retries).toHaveLength(2); // the plan's and the table's
      const before = plantsApi['getByGarden'].mock.calls.length;

      retries[0].click();
      retries[1].click();

      await vi.waitFor(() =>
        expect(plantsApi['getByGarden'].mock.calls.length).toBeGreaterThan(before),
      );
    });

    it('choosing a plant in the table selects it on the plan, and again clears it', async () => {
      const { fixture, vm, el } = await loaded();

      el.querySelector<HTMLButtonElement>('button.plant-name-btn')!.click();
      fixture.detectChanges();
      expect(vm.selectedPlantId()).toBe(11);

      el.querySelector<HTMLButtonElement>('button.plant-name-btn')!.click();
      fixture.detectChanges();
      expect(vm.selectedPlantId()).toBeNull();
    });
  });
});
