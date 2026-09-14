import { ApiError } from '../../../core/errors/api-error';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Garden, Plant } from '../../../core/api/models';
import { PlantFormDialog, type PlantFormData, type PlantModel } from './plant-form-dialog';

/** Set a few fields of the model, as typing into them would. */
const patch = (
  vm: { model: { update: (fn: (m: PlantModel) => PlantModel) => void } },
  values: Partial<PlantModel>,
) => vm.model.update((m) => ({ ...m, ...values }));

const garden: Garden = {
  gardenId: 1,
  gardenName: 'Test Garden',
  totalSurfaceArea: 10,
  targetHumidityLevel: 55,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

const existingPlant: Plant = {
  plantId: 7,
  plantName: 'Tomato',
  species: 'Solanum',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: 6,
  idealHumidityLevel: 60,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
};

function storeStub() {
  return {
    saving: signal(false),
    createPlant: vi.fn().mockResolvedValue({ ok: true }),
    updatePlant: vi.fn().mockResolvedValue({ ok: true }),
  };
}

async function mount(data: Omit<PlantFormData, 'store'> & { store: ReturnType<typeof storeStub> }) {
  TestBed.configureTestingModule({
    imports: [PlantFormDialog],
    providers: [
      provideNoopAnimations(),
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(PlantFormDialog);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('PlantFormDialog (capacity behaviour — the core business rule)', () => {
  it('shows the live garden-fit breakdown: available / this plant / remaining', async () => {
    const store = storeStub();
    const fixture = await mount({ garden, plants: [existingPlant], plant: null, store });

    fixture.componentInstance['f'].surfaceAreaRequired().value.set(3);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Available');
    expect(text).toContain('4 m²'); // 10 total − 6 used
    expect(text).toContain('This plant');
    expect(text).toContain('Remaining');
    expect(text).toContain('1 m²'); // 4 − 3
  });

  it('blocks an over-capacity plant client-side with a clear message and never calls the API', async () => {
    const store = storeStub();
    const fixture = await mount({ garden, plants: [existingPlant], plant: null, store });

    fixture.componentInstance['model'].update((m) => ({
      ...m,
      plantName: 'Pumpkin',
      species: 'Cucurbita maxima',
      surfaceAreaRequired: 7, // only 4 m² available
    }));
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('7 m²');
    expect(alert?.textContent).toContain('4 m²');

    await fixture.componentInstance['submit']();
    expect(store.createPlant).not.toHaveBeenCalled();
  });

  it('accepts a plant that exactly fills the garden (strict > rule, mirroring the server)', async () => {
    const store = storeStub();
    const fixture = await mount({ garden, plants: [existingPlant], plant: null, store });

    fixture.componentInstance['model'].update((m) => ({
      ...m,
      plantName: 'Lettuce',
      species: 'Lactuca sativa',
      surfaceAreaRequired: 4, // exactly the remaining capacity
    }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    await fixture.componentInstance['submit']();
    expect(store.createPlant).toHaveBeenCalledOnce();
  });

  it('editing a plant does not count its own current area against itself', async () => {
    const store = storeStub();
    const fixture = await mount({ garden, plants: [existingPlant], plant: existingPlant, store });

    // Growing the tomato from 6 to 10 m² fits: the whole garden is available to it.
    fixture.componentInstance['f'].surfaceAreaRequired().value.set(10);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    await fixture.componentInstance['submit']();
    expect(store.updatePlant).toHaveBeenCalledOnce();

    // 10.5 m² does not.
    fixture.componentInstance['f'].surfaceAreaRequired().value.set(10.5);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('an area preset writes through the control, so the overcrowding rule still judges it', async () => {
    // Garden of 10 with 9.5 already used by another plant.
    const bigNeighbor: Plant = { ...existingPlant, plantId: 8, surfaceAreaRequired: 9.5 };
    const store = storeStub();
    const fixture = await mount({ garden, plants: [bigNeighbor], plant: null, store });
    const el: HTMLElement = fixture.nativeElement;

    const spreading = [...el.querySelectorAll<HTMLButtonElement>('button.preset')].find((b) =>
      b.textContent?.includes('Spreading'),
    )!;
    spreading.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // 2 m² preset vs 0.5 m² available: preset chose the value, the domain rule blocks it.
    expect(fixture.componentInstance['f'].surfaceAreaRequired().value()).toBe(2);
    expect(el.textContent).toContain('only');
    await fixture.componentInstance['submit']();
    expect(store.createPlant).not.toHaveBeenCalled();
  });
});

describe('PlantFormDialog — catalog search, presets and submit paths', () => {
  type DialogApi = {
    query: { (): string; set: (v: string) => void };
    cards: () => readonly { preset: { commonName: string } }[];
    applyPreset: (rec: unknown) => void;
    selectedPresetId: () => string | null;
    fitBadge: (rec: unknown) => string;
    previewUsed: () => number;
    requires: () => number;
    remainingAfterSave: () => number;
    overcrowds: () => boolean;
    serverError: () => string | null;
    model: { update: (fn: (m: PlantModel) => PlantModel) => void };
    submit: () => Promise<boolean>;
  };

  const api = (fixture: { componentInstance: unknown }) => fixture.componentInstance as DialogApi;

  let ref: { close: ReturnType<typeof vi.fn> };

  const mountWith = async (
    data: { plant: Plant | null; plants: readonly Plant[] },
    store = storeStub(),
  ) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlantFormDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { garden, ...data, store } },
        { provide: MatDialogRef, useValue: ref },
      ],
    });
    const fixture = TestBed.createComponent(PlantFormDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, vm: api(fixture), store };
  };

  beforeEach(() => {
    ref = { close: vi.fn() };
  });

  describe('catalog', () => {
    it('shows the best matches for this garden when the search is empty', async () => {
      const { vm } = await mountWith({ plant: null, plants: [] });
      expect(vm.cards().length).toBeGreaterThan(0);
      expect(vm.cards().length).toBeLessThanOrEqual(8);
    });

    it('filters by common name', async () => {
      const { vm } = await mountWith({ plant: null, plants: [] });
      vm.query.set('tom');
      expect(vm.cards().every((c) => /tom/i.test(c.preset.commonName))).toBe(true);
    });

    it('filters by scientific name too', async () => {
      const { vm } = await mountWith({ plant: null, plants: [] });
      vm.query.set('solanum');
      expect(vm.cards().length).toBeGreaterThan(0);
    });

    it('returns nothing for a query that matches neither name', async () => {
      const { vm } = await mountWith({ plant: null, plants: [] });
      vm.query.set('zzzznotaplant');
      expect(vm.cards()).toHaveLength(0);
    });

    it('applying a preset fills the form and marks the card selected', async () => {
      const { fixture, vm } = await mountWith({ plant: null, plants: [] });
      const first = vm.cards()[0];

      vm.applyPreset(first);
      fixture.detectChanges();

      expect(vm.selectedPresetId()).not.toBeNull();
    });

    it('badges every fit quality the ranking can produce', async () => {
      // A roomy empty garden yields humidity-based badges…
      const roomy = await mountWith({ plant: null, plants: [] });
      const roomyBadges = roomy.vm.cards().map((c) => roomy.vm.fitBadge(c));
      expect(roomyBadges.length).toBeGreaterThan(0);
      for (const badge of roomyBadges) {
        expect(badge).toMatch(/Excellent fit|Good fit|Prefers \d+% humidity/);
      }

      // …and a nearly-full garden yields the "won't fit" badge instead.
      const nearlyFull = await mountWith({
        plant: null,
        plants: [{ ...existingPlant, surfaceAreaRequired: garden.totalSurfaceArea - 0.1 }],
      });
      const tightBadges = nearlyFull.vm.cards().map((c) => nearlyFull.vm.fitBadge(c));
      expect(tightBadges.some((b) => /^Needs \d/.test(b))).toBe(true);
    });
  });

  describe('capacity preview', () => {
    it("adds this form's request to the OTHER plants, not to itself, when editing", async () => {
      const { vm } = await mountWith({ plant: existingPlant, plants: [existingPlant] });
      // Editing the only plant: the other plants total 0, so the preview is
      // whatever the form currently asks for.
      expect(vm.previewUsed()).toBe(vm.requires());
    });

    it('never previews a negative footprint', async () => {
      const { fixture, vm } = await mountWith({ plant: null, plants: [] });
      patch(vm, { surfaceAreaRequired: -5 });
      fixture.detectChanges();

      expect(vm.requires()).toBe(0);
      expect(vm.previewUsed()).toBeGreaterThanOrEqual(0);
    });

    it('reports the remaining area after saving as-is', async () => {
      const { fixture, vm } = await mountWith({ plant: null, plants: [] });
      patch(vm, { surfaceAreaRequired: 5 });
      fixture.detectChanges();

      expect(vm.remainingAfterSave()).toBe(garden.totalSurfaceArea - 5);
    });

    it('states the free area to two decimals — never raw float noise', async () => {
      // 0.1 + 0.2 = 0.30000000000000004: a summed area is never exact in binary
      // floats, and the hint once read "5.800000000000001 m² available".
      const { fixture } = await mountWith({
        plant: null,
        plants: [
          { ...existingPlant, plantId: 1, surfaceAreaRequired: 0.1 },
          { ...existingPlant, plantId: 2, surfaceAreaRequired: 0.2 },
        ],
      });
      const hint = (fixture.nativeElement as HTMLElement).querySelector('mat-hint');
      expect(hint?.textContent?.trim()).toBe('9.7 m² available in this garden');
    });
  });

  describe('submit', () => {
    const fill = (vm: DialogApi) =>
      patch(vm, {
        plantName: 'Tomato',
        species: 'Solanum',
        plantType: 'vegetable',
        surfaceAreaRequired: 2,
        idealHumidityLevel: 60,
      });

    it('creates when there is no plant to edit', async () => {
      const { vm, store } = await mountWith({ plant: null, plants: [] });
      fill(vm);

      await vm.submit();

      expect(store.createPlant).toHaveBeenCalled();
      expect(ref.close).toHaveBeenCalledWith(true);
    });

    it('updates when editing an existing plant', async () => {
      const { vm, store } = await mountWith({ plant: existingPlant, plants: [existingPlant] });
      fill(vm);

      await vm.submit();

      expect(store.updatePlant).toHaveBeenCalledWith(existingPlant.plantId, expect.anything());
      expect(store.createPlant).not.toHaveBeenCalled();
    });

    it('renders a functional verdict inline and keeps the dialog open', async () => {
      const store = storeStub();
      store.createPlant.mockResolvedValue({
        ok: false,
        error: new ApiError('functional', 'Garden would be overcrowded', 400),
      });
      const { vm } = await mountWith({ plant: null, plants: [] }, store);
      fill(vm);

      await vm.submit();

      expect(vm.serverError()).toBe('Garden would be overcrowded');
      expect(ref.close).not.toHaveBeenCalled();
    });

    it('leaves a technical failure to the toast layer', async () => {
      const store = storeStub();
      store.createPlant.mockResolvedValue({
        ok: false,
        error: new ApiError('technical', 'Server exploded', 500),
      });
      const { vm } = await mountWith({ plant: null, plants: [] }, store);
      fill(vm);

      await vm.submit();

      expect(vm.serverError()).toBeNull();
      expect(ref.close).not.toHaveBeenCalled();
    });
  });
});

describe('PlantFormDialog — every validation message renders', () => {
  type Vm = {
    model: { update: (fn: (m: PlantModel) => PlantModel) => void };
    f: () => { markAsTouched: () => void };
    serverError: { set: (v: string) => void };
  };

  const mountFresh = async (plant: Plant | null = null) => {
    const store = storeStub();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlantFormDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { garden, plants: [], plant, store } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(PlantFormDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    return {
      fixture,
      vm: fixture.componentInstance as unknown as Vm,
      el: fixture.nativeElement as HTMLElement,
      store,
    };
  };

  const show = async (values: Partial<PlantModel>) => {
    const { fixture, vm, el } = await mountFresh();
    patch(vm, values);
    vm.f().markAsTouched();
    fixture.detectChanges();
    return el.textContent ?? '';
  };

  it('plant name is required', async () => {
    expect(await show({ plantName: '' })).toContain('Plant name is required');
  });

  it('species is required', async () => {
    expect(await show({ species: '' })).toContain('Species is required');
  });

  it('plantation date is required', async () => {
    expect(await show({ plantationDate: null })).toContain('Plantation date is required');
  });

  it('surface area is required', async () => {
    expect(await show({ surfaceAreaRequired: null })).toContain('Surface area is required');
  });

  it("surface area can't be negative", async () => {
    expect(await show({ surfaceAreaRequired: -2 })).toContain("Surface area can't be negative");
  });

  it('renders a server error inline', async () => {
    const { fixture, vm, el } = await mountFresh();
    vm.serverError.set('The greenhouse said no.');
    fixture.detectChanges();
    expect(el.textContent).toContain('The greenhouse said no.');
  });

  it('shows the catalog picker when creating and hides it when editing', async () => {
    const creating = await mountFresh(null);
    expect(creating.el.textContent).toContain('Recommended for your garden');

    const editing = await mountFresh(existingPlant);
    expect(editing.el.textContent).not.toContain('Recommended for your garden');
  });

  it('ghosts the submit button while the store is saving — never a spinner', async () => {
    const { fixture, el, store } = await mountFresh();
    store.saving.set(true);
    fixture.detectChanges();

    expect(el.querySelector('mat-spinner, .mat-mdc-progress-spinner')).toBeNull();
    expect(el.querySelector('.btn-ghost')).not.toBeNull();
  });
});

describe('PlantFormDialog — typing into the fields (the DOM path, not the model)', () => {
  it('a negative area typed into the input shows the rule under the field', async () => {
    const store = storeStub();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlantFormDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { garden, plants: [], plant: null, store } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(PlantFormDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[type="number"]')!;

    input.value = '-5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    const field = fixture.componentInstance['f'].surfaceAreaRequired();
    expect(
      field.errors().map((e) => e.kind + ':' + (e.message ?? '')),
      `value=${String(field.value())}`,
    ).toContain("min:Surface area can't be negative");
    expect(el.textContent).toContain("Surface area can't be negative");
    // The browser must not answer first: `[formField]` sets native `required`
    // and `min`, and without `novalidate` its bubble would block the submit
    // before `submit()` could show the app's own errors.
    expect(el.querySelector('form')?.hasAttribute('novalidate')).toBe(true);
  });
});
