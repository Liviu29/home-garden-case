import { of } from 'rxjs';
import { GardensStore } from '../../state/gardens-store/gardens-store';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { MatDialog } from '@angular/material/dialog';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { APP_CONFIG, type AppConfig } from '../../core/config/app-config';
import type { Garden } from '../../core/api/models';
import { ApiError } from '../../core/errors/api-error';
import { GardenList } from './garden-list';

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

/** Zero skeleton delays so states are assertable without timer gymnastics. */
const TEST_CONFIG: AppConfig = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 3, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  toastDurationMs: 5000,
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('GardenList (screen states a user notices)', () => {
  let gardensApi: { getAll: ReturnType<typeof vi.fn> };

  async function mount() {
    const fixture = TestBed.createComponent(GardenList);
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    gardensApi = { getAll: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GardenList],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        {
          provide: PlantsApi,
          useValue: {
            getByGarden: vi.fn().mockResolvedValue([]),
            getAll: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    });
  });

  it('renders ghost skeleton cards while gardens load', async () => {
    gardensApi.getAll.mockReturnValue(new Promise(() => undefined)); // never resolves
    const fixture = await mount();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('app-skeleton').length).toBeGreaterThan(0);
    expect(el.querySelector('[role="status"]')).not.toBeNull(); // accessible loading
  });

  it('renders a garden card per garden on success', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'Backyard'), garden(2, 'Patio')]);
    const fixture = await mount();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Backyard');
    expect(text).toContain('Patio');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('article.card')).toHaveLength(2);
  });

  it('marks the gardens no profile owns as shared', async () => {
    gardensApi.getAll.mockResolvedValue([
      { ...garden(1, 'Community Bed'), ownerId: null },
      { ...garden(2, 'My Patio'), ownerId: 7 },
    ]);
    const fixture = await mount();

    const cards = [...(fixture.nativeElement as HTMLElement).querySelectorAll('article.card')];
    const sharedChip = (name: string) =>
      cards.find((c) => c.textContent?.includes(name))?.querySelector('.chip.shared') ?? null;
    expect(sharedChip('Community Bed')?.textContent?.trim()).toBe('Shared');
    expect(sharedChip('My Patio')).toBeNull();
  });

  it('holds a card’s capacity rows with ghosts while its plants load', async () => {
    TestBed.overrideProvider(PlantsApi, {
      useValue: { getByGarden: vi.fn().mockReturnValue(new Promise(() => undefined)) },
    });
    gardensApi.getAll.mockResolvedValue([garden(1, 'Backyard')]);
    const fixture = await mount();

    const card = (fixture.nativeElement as HTMLElement).querySelector('article.card')!;
    const ghost = card.querySelector('.plants-ghost')!;
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    // Row for row app-capacity-bar: the caption's two halves, then the track
    expect(ghost.querySelectorAll('app-skeleton')).toHaveLength(3);
    // …then the status chip beside the total that is already known
    expect(card.querySelector('.meta app-skeleton')).not.toBeNull();
    expect(card.querySelector('.meta')?.textContent).toContain('20 m² total');
  });

  it('points out a garden created from this screen — and only that one', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'Backyard')]);
    Object.assign(gardensApi, { create: vi.fn().mockResolvedValue(garden(2, 'Herb Spiral')) });
    const fixture = await mount();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('article.card.is-new')).toBeNull();

    await TestBed.inject(GardensStore).create({
      gardenName: 'Herb Spiral',
      totalSurfaceArea: 20,
      targetHumidityLevel: 50,
    });
    fixture.detectChanges();

    const fresh = el.querySelectorAll('article.card.is-new');
    expect(fresh).toHaveLength(1);
    expect(fresh[0].getAttribute('data-garden-id')).toBe('2');
  });

  describe('bringing the new card into view', () => {
    const createFromHere = async () => {
      gardensApi.getAll.mockResolvedValue([garden(1, 'Backyard')]);
      Object.assign(gardensApi, { create: vi.fn().mockResolvedValue(garden(2, 'Herb Spiral')) });
      const fixture = await mount();
      await TestBed.inject(GardensStore).create({
        gardenName: 'Herb Spiral',
        totalSurfaceArea: 20,
        targetHumidityLevel: 50,
      });
      fixture.detectChanges();
      await fixture.whenStable();
    };
    let scroll: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      scroll = vi.fn();
      Element.prototype.scrollIntoView =
        scroll as unknown as typeof Element.prototype.scrollIntoView;
    });

    afterEach(() => {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      vi.unstubAllGlobals();
    });

    it('scrolls it into view smoothly', async () => {
      await createFromHere();
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    });

    it('jumps instead of gliding under reduced motion', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
      await createFromHere();
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
    });
  });

  it('renders the designed empty state with a create CTA when there are no gardens', async () => {
    gardensApi.getAll.mockResolvedValue([]);
    const fixture = await mount();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-empty-state')).not.toBeNull();
    expect(el.textContent).toContain('No gardens yet');
    expect(el.textContent).toContain('Create your first garden');
  });

  it('renders the error state with a retry affordance when loading fails outright', async () => {
    gardensApi.getAll.mockRejectedValue(new ApiError('technical', 'boom', 500));
    const fixture = await mount();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Couldn't load your gardens");
    const retry = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try again'),
    );
    expect(retry).toBeDefined();
  });
});

describe('GardenList — toolbar and row actions', () => {
  let gardensApi: Record<string, ReturnType<typeof vi.fn>>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let confirm: { confirm: ReturnType<typeof vi.fn> };

  const GARDENS = [
    {
      gardenId: 1,
      gardenName: 'Backyard Beds',
      totalSurfaceArea: 20,
      targetHumidityLevel: 50,
      locationDescription: 'behind the shed',
      latitude: null,
      longitude: null,
      createdAt: '',
      updatedAt: '',
    },
    {
      gardenId: 2,
      gardenName: 'Herb Spiral',
      totalSurfaceArea: 8,
      targetHumidityLevel: 45,
      locationDescription: null,
      latitude: null,
      longitude: null,
      createdAt: '',
      updatedAt: '',
    },
  ];

  type ListApi = {
    openCreate: () => void;
    openEdit: (g: (typeof GARDENS)[number]) => void;
    remove: (g: (typeof GARDENS)[number]) => Promise<void>;
    retry: () => void;
  };

  const mountList = async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GardenList],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        {
          provide: PlantsApi,
          useValue: {
            getByGarden: vi.fn().mockResolvedValue([]),
            getAll: vi.fn().mockResolvedValue([]),
          },
        },
        { provide: MatDialog, useValue: dialog },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    const fixture = TestBed.createComponent(GardenList);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return {
      fixture,
      vm: fixture.componentInstance as unknown as ListApi,
      store: TestBed.inject(GardensStore),
      el: fixture.nativeElement as HTMLElement,
    };
  };

  beforeEach(() => {
    localStorage.clear();
    gardensApi = {
      getAll: vi.fn().mockResolvedValue(GARDENS),
      getById: vi.fn().mockResolvedValue(GARDENS[0]),
      delete: vi.fn(),
    };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(false) }) };
    confirm = { confirm: vi.fn().mockResolvedValue(false) };
  });

  it('renders a card per garden, with its location', async () => {
    const { el } = await mountList();
    expect(el.querySelectorAll('article.card')).toHaveLength(2);
    expect(el.textContent).toContain('Backyard Beds');
    expect(el.textContent).toContain('behind the shed');
  });

  it('filters to the "no matches" state when the search matches nothing', async () => {
    const { fixture, store, el } = await mountList();
    store.setQuery('zzzz');
    fixture.detectChanges();

    expect(el.querySelectorAll('article.card')).toHaveLength(0);
    expect(el.textContent).toContain('No gardens match');
  });

  it('narrows the grid when the search matches one garden', async () => {
    const { fixture, store, el } = await mountList();
    store.setQuery('herb');
    fixture.detectChanges();

    expect(el.querySelectorAll('article.card')).toHaveLength(1);
    expect(el.textContent).toContain('Herb Spiral');
  });

  it('opens the create dialog with no garden', async () => {
    const { vm } = await mountList();
    vm.openCreate();
    expect(dialog.open).toHaveBeenCalledWith(expect.anything(), { data: { garden: null } });
  });

  it('opens the edit dialog with the chosen garden', async () => {
    const { vm } = await mountList();
    vm.openEdit(GARDENS[0]);
    expect(dialog.open).toHaveBeenCalledWith(expect.anything(), {
      data: { garden: GARDENS[0] },
    });
  });

  it('asks before deleting, and does nothing when declined', async () => {
    const { vm, store } = await mountList();
    const remove = vi.spyOn(store, 'remove');

    await vm.remove(GARDENS[0]);

    expect(confirm.confirm).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('warns that plants go too, then deletes once confirmed', async () => {
    const { vm, store } = await mountList();
    const remove = vi.spyOn(store, 'remove').mockResolvedValue(undefined);
    confirm.confirm.mockResolvedValue(true);

    await vm.remove(GARDENS[0]);

    expect(confirm.confirm.mock.calls[0][0].message).toContain('all of its plants');
    expect(remove).toHaveBeenCalledWith(GARDENS[0]);
  });

  it('retry asks the store to load again', async () => {
    const { vm, store } = await mountList();
    const load = vi.spyOn(store, 'load');
    vm.retry();
    expect(load).toHaveBeenCalled();
  });

  it('renders only the mutating card as a ghost', async () => {
    // A delete that never answers keeps garden 1 pending: its card is the
    // ghost, its neighbour is not.
    gardensApi['delete'] = vi.fn(() => new Promise<void>(() => undefined));
    const { fixture, store, el } = await mountList();
    void store.remove(GARDENS[0]);
    await fixture.whenStable();
    fixture.detectChanges();

    const card = (id: number) => el.querySelector(`[data-garden-id="${id}"]`);
    expect(card(1)?.classList.contains('mutation-ghost')).toBe(true);
    expect(card(1)?.getAttribute('aria-busy')).toBe('true');
    expect(card(2)?.classList.contains('mutation-ghost')).toBe(false);
  });
});

describe('GardenList — every rendered control', () => {
  const GARDENS = [
    {
      gardenId: 1,
      gardenName: 'Backyard Beds',
      totalSurfaceArea: 20,
      targetHumidityLevel: 50,
      locationDescription: 'behind the shed',
      latitude: null,
      longitude: null,
      createdAt: '',
      updatedAt: '',
    },
    {
      gardenId: 2,
      gardenName: 'Herb Spiral',
      totalSurfaceArea: 8,
      targetHumidityLevel: 45,
      locationDescription: null,
      latitude: null,
      longitude: null,
      createdAt: '',
      updatedAt: '',
    },
  ];

  let gardensApi: Record<string, ReturnType<typeof vi.fn>>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let confirm: { confirm: ReturnType<typeof vi.fn> };

  const mountList = async (getAll = vi.fn().mockResolvedValue(GARDENS)) => {
    // The cards carry the PrefetchGarden directive, which asks for the garden
    // and its plants on hover/focus — the stub must answer both.
    gardensApi = { getAll, getById: vi.fn().mockResolvedValue(GARDENS[0]), delete: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GardenList],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        {
          provide: PlantsApi,
          useValue: {
            getByGarden: vi.fn().mockResolvedValue([]),
            getAll: vi.fn().mockResolvedValue([]),
          },
        },
        { provide: MatDialog, useValue: dialog },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    const fixture = TestBed.createComponent(GardenList);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return {
      fixture,
      store: TestBed.inject(GardensStore),
      el: fixture.nativeElement as HTMLElement,
    };
  };

  beforeEach(() => {
    localStorage.clear();
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(false) }) };
    confirm = { confirm: vi.fn().mockResolvedValue(false) };
  });

  it('the header New garden button opens the create dialog', async () => {
    const { el } = await mountList();
    [...el.querySelectorAll('button')]
      .find((b) => /new garden/i.test(b.textContent ?? ''))!
      .click();

    expect(dialog.open).toHaveBeenCalledWith(expect.anything(), { data: { garden: null } });
  });

  it('typing in the search box narrows the grid', async () => {
    const { fixture, store, el } = await mountList();
    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;

    input.value = 'herb';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.query()).toBe('herb');
  });

  it('changing the sort updates the store', async () => {
    const { fixture, store, el } = await mountList();
    const select = el.querySelector('mat-select') as HTMLElement;

    select.click();
    fixture.detectChanges();
    const option = [...document.querySelectorAll('mat-option')].find((o) =>
      /utilization/i.test(o.textContent ?? ''),
    ) as HTMLElement;
    option.click();
    fixture.detectChanges();

    expect(store.sort()).toBe('utilization');
  });

  it('the no-matches Clear search button empties the query', async () => {
    const { fixture, store, el } = await mountList();
    store.setQuery('zzzz');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const clear = await vi.waitFor(() => {
      fixture.detectChanges();
      const button = [...el.querySelectorAll('button')].find((b) =>
        /clear search/i.test(b.textContent ?? ''),
      );
      expect(button).toBeDefined();
      return button!;
    });

    clear.click();
    fixture.detectChanges();

    expect(store.query()).toBe('');
  });

  it('the empty-state CTA opens the create dialog', async () => {
    const { fixture, el } = await mountList(vi.fn().mockResolvedValue([]));

    // The empty state sits behind the skeleton's appear delay.
    const cta = await vi.waitFor(() => {
      fixture.detectChanges();
      const button = [...el.querySelectorAll('button')].find((b) =>
        /create your first garden/i.test(b.textContent ?? ''),
      );
      expect(button).toBeDefined();
      return button!;
    });

    cta.click();
    expect(dialog.open).toHaveBeenCalled();
  });

  it('the error-state Try again button reloads', async () => {
    const getAll = vi.fn().mockRejectedValue(new ApiError('technical', 'boom', 500));
    const { fixture, store, el } = await mountList(getAll);
    await vi.waitFor(() => expect(store.hasFailed()).toBe(true));
    fixture.detectChanges();
    const load = vi.spyOn(store, 'load');

    [...el.querySelectorAll('button')].find((b) => /try again/i.test(b.textContent ?? ''))!.click();

    expect(load).toHaveBeenCalled();
  });

  it('a card kebab menu offers Edit and Delete, and both are wired', async () => {
    const { fixture, el } = await mountList();

    const kebab = await vi.waitFor(() => {
      fixture.detectChanges();
      const button = el.querySelector<HTMLButtonElement>('.kebab');
      expect(button).not.toBeNull();
      return button!;
    });
    kebab.click();
    fixture.detectChanges();

    const items = [...document.querySelectorAll<HTMLButtonElement>('button.mat-mdc-menu-item')];
    const edit = items.find((b) => /edit/i.test(b.textContent ?? ''));
    const remove = items.find((b) => /delete/i.test(b.textContent ?? ''));
    expect(edit).toBeDefined();
    expect(remove).toBeDefined();

    edit!.click();
    expect(dialog.open).toHaveBeenCalledWith(expect.anything(), {
      data: { garden: expect.objectContaining({ gardenId: 1 }) },
    });

    remove!.click();
    await Promise.resolve();
    expect(confirm.confirm).toHaveBeenCalled();
  });
});
