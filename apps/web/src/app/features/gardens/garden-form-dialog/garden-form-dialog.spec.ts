import { GardensStore } from '../../../state/gardens-store/gardens-store';
import { ApiError } from '../../../core/errors/api-error';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { GardensApi } from '../../../core/api/gardens-api';
import { PlantsApi } from '../../../core/api/plants-api';
import type { Garden, Plant } from '../../../core/api/models';
import { PlantsIndexStore } from '../../../state/plants-index-store/plants-index-store';
import { GardenFormDialog, type GardenModel } from './garden-form-dialog';

/** Set a few fields of the model, as typing into them would. */
const patch = (
  vm: { model: { update: (fn: (m: GardenModel) => GardenModel) => void } },
  values: Partial<GardenModel>,
) => vm.model.update((m) => ({ ...m, ...values }));

/** The dialog's surface the specs drive, behind its protected members. */
type DialogApi = {
  model: { update: (fn: (m: GardenModel) => GardenModel) => void };
  serverError: () => string | null;
  submit: () => Promise<boolean>;
  usedArea: () => number | null;
  shrinksBelowUsed: () => boolean;
};

const garden: Garden = {
  gardenId: 4,
  gardenName: 'Shrink Garden',
  totalSurfaceArea: 20,
  targetHumidityLevel: 50,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

const plants: Plant[] = [
  {
    plantId: 1,
    plantName: 'Big plant',
    species: 's',
    plantType: 'vegetable',
    plantationDate: '2026-04-01T00:00:00.000Z',
    surfaceAreaRequired: 15,
    idealHumidityLevel: 50,
    gardenId: 4,
    createdAt: '',
    updatedAt: '',
  },
];

describe('GardenFormDialog (shrink-below-used warning)', () => {
  async function mount(data: { garden: Garden | null }) {
    TestBed.configureTestingModule({
      imports: [GardenFormDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: GardensApi, useValue: { create: vi.fn(), update: vi.fn() } },
        { provide: PlantsApi, useValue: { getByGarden: vi.fn().mockResolvedValue(plants) } },
      ],
    });
    // Seed the single plants owner so used area is known synchronously.
    TestBed.inject(PlantsIndexStore).setPlants(garden.gardenId, plants);
    const fixture = TestBed.createComponent(GardenFormDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('warns live when the edited total drops below used area — and only then', async () => {
    const fixture = await mount({ garden });
    const el: HTMLElement = fixture.nativeElement;

    // Initial total (20) is above used (15): no warning.
    expect(el.querySelector('.form-warning')).toBeNull();

    fixture.componentInstance['f'].totalSurfaceArea().value.set(10);
    await fixture.whenStable();
    fixture.detectChanges();
    const warning = el.querySelector('.form-warning');
    expect(warning?.getAttribute('role')).toBe('alert');
    expect(warning?.textContent).toContain('15');
    // …and it describes the field it judges.
    expect(warning?.id).toBe('garden-shrink-warning');
    expect(el.querySelector('input[aria-describedby~="garden-shrink-warning"]')).not.toBeNull();

    // Exactly the used area is allowed without warning (strict <).
    fixture.componentInstance['f'].totalSurfaceArea().value.set(15);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.form-warning')).toBeNull();
  });

  it('never warns when creating a new garden', async () => {
    const fixture = await mount({ garden: null });
    fixture.componentInstance['f'].totalSurfaceArea().value.set(0.5);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.form-warning')).toBeNull();
  });

  it('a size preset writes through the form control (and highlights its chip)', async () => {
    const fixture = await mount({ garden: null });
    const el: HTMLElement = fixture.nativeElement;

    const large = [...el.querySelectorAll<HTMLButtonElement>('button.value-presets__option')].find(
      (b) => b.textContent?.includes('Large'),
    )!;
    large.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance['f'].totalSurfaceArea().value()).toBe(50);
    expect(fixture.componentInstance['f'].totalSurfaceArea().dirty()).toBe(true);
    expect(large.getAttribute('aria-pressed')).toBe('true');
  });

  it('a humidity preset still passes through the 0–100 validators, and custom values remain possible', async () => {
    const fixture = await mount({ garden: null });
    const el: HTMLElement = fixture.nativeElement;

    const balanced = [
      ...el.querySelectorAll<HTMLButtonElement>('button.value-presets__option'),
    ].find((b) => b.textContent?.includes('Balanced'))!;
    balanced.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const humidity = fixture.componentInstance['f'].targetHumidityLevel();
    expect(humidity.value()).toBe(60);
    expect(humidity.valid()).toBe(true);

    // Custom values are first-class: presets never lock the field…
    humidity.value.set(73);
    expect(humidity.valid()).toBe(true);
    // …and the validator (not the preset list) remains the authority.
    humidity.value.set(140);
    expect(humidity.getError('max')).toBeDefined();
  });

  it('leaves validation to the app, not the browser: the form is novalidate', async () => {
    // `[formField]` sets the native `required`/`min` attributes from the schema.
    // Without `novalidate` the browser would block the submit with its own
    // bubble before `submit()` could mark the fields touched and show ours.
    const fixture = await mount({ garden: null });
    const form = (fixture.nativeElement as HTMLElement).querySelector('form');
    expect(form?.hasAttribute('novalidate')).toBe(true);
  });

  it('exactly one preset per group carries the Recommended badge', async () => {
    const fixture = await mount({ garden: null });
    const badges = (fixture.nativeElement as HTMLElement).querySelectorAll('.value-presets__badge');
    expect(badges).toHaveLength(2); // one for size, one for humidity
  });
});

describe('GardenFormDialog — submit paths', () => {
  const GARDEN: Garden = {
    gardenId: 1,
    gardenName: 'Backyard',
    totalSurfaceArea: 20,
    targetHumidityLevel: 50,
    locationDescription: 'shed',
    latitude: null,
    longitude: null,
    createdAt: '',
    updatedAt: '',
  };

  let api: Record<string, ReturnType<typeof vi.fn>>;
  let ref: { close: ReturnType<typeof vi.fn> };

  const mountFor = async (garden: Garden | null, seedPlants = true) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GardenFormDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { garden } },
        { provide: MatDialogRef, useValue: ref },
        { provide: GardensApi, useValue: api },
        { provide: PlantsApi, useValue: { getByGarden: vi.fn().mockResolvedValue([]) } },
      ],
    });
    if (garden && seedPlants) {
      TestBed.inject(PlantsIndexStore).setPlants(garden.gardenId, []);
    }
    const fixture = TestBed.createComponent(GardenFormDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, vm: fixture.componentInstance as unknown as DialogApi };
  };

  beforeEach(() => {
    localStorage.clear();
    api = {
      getAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(GARDEN),
      update: vi.fn().mockResolvedValue(GARDEN),
      delete: vi.fn(),
    };
    ref = { close: vi.fn() };
  });

  it('refuses to submit an invalid form', async () => {
    const { vm } = await mountFor(null);
    patch(vm, { gardenName: '' });
    await vm.submit();
    expect(api['create']).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only name', async () => {
    const { vm } = await mountFor(null);
    patch(vm, { gardenName: '   ', totalSurfaceArea: 20, targetHumidityLevel: 50 });
    await vm.submit();
    expect(api['create']).not.toHaveBeenCalled();
  });

  it('creates a garden with trimmed values and closes', async () => {
    const { vm } = await mountFor(null);
    patch(vm, {
      gardenName: '  New bed  ',
      totalSurfaceArea: 12,
      targetHumidityLevel: 55,
      locationDescription: '  by the wall  ',
    });

    await vm.submit();

    expect(api['create']).toHaveBeenCalledWith(
      expect.objectContaining({ gardenName: 'New bed', locationDescription: 'by the wall' }),
    );
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('nulls an empty location rather than sending an empty string', async () => {
    const { vm } = await mountFor(null);
    patch(vm, {
      gardenName: 'Bed',
      totalSurfaceArea: 12,
      targetHumidityLevel: 55,
      locationDescription: '   ',
    });

    await vm.submit();

    expect(api['create']).toHaveBeenCalledWith(
      expect.objectContaining({ locationDescription: null }),
    );
  });

  it('updates an existing garden rather than creating a second one', async () => {
    const { vm } = await mountFor(GARDEN);
    patch(vm, { gardenName: 'Renamed' });

    await vm.submit();

    expect(api['update']).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ gardenName: 'Renamed' }),
    );
    expect(api['create']).not.toHaveBeenCalled();
  });

  it('renders a functional verdict inline and keeps the dialog open', async () => {
    api['create'].mockRejectedValue(new ApiError('functional', 'Name already used', 400));
    const { vm } = await mountFor(null);
    patch(vm, { gardenName: 'Bed', totalSurfaceArea: 12, targetHumidityLevel: 55 });

    await vm.submit();

    expect(vm.serverError()).toBe('Name already used');
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('leaves a technical failure to the toast, not the form', async () => {
    api['create'].mockRejectedValue(new ApiError('technical', 'Server exploded', 500));
    const { vm } = await mountFor(null);
    patch(vm, { gardenName: 'Bed', totalSurfaceArea: 12, targetHumidityLevel: 55 });

    await vm.submit();

    expect(vm.serverError()).toBeNull();
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('reports used area as UNKNOWN while the plants are still loading', async () => {
    // The dialog asks the plants index to load on construction, so "unknown"
    // is the window before that settles — and during it the shrink warning
    // must stay silent rather than claim 0 m² are in use.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GardenFormDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { garden: GARDEN } },
        { provide: MatDialogRef, useValue: ref },
        { provide: GardensApi, useValue: api },
        {
          provide: PlantsApi,
          useValue: { getByGarden: vi.fn().mockReturnValue(new Promise(() => undefined)) },
        },
      ],
    });
    const fixture = TestBed.createComponent(GardenFormDialog);
    fixture.detectChanges();
    const vm = fixture.componentInstance as unknown as DialogApi;

    expect(vm.usedArea()).toBeNull();
    expect(vm.shrinksBelowUsed()).toBe(false);
  });
});

describe('GardenFormDialog — coordinate cross-validation', () => {
  const mountBlank = async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GardenFormDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { garden: null } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: GardensApi, useValue: { create: vi.fn(), update: vi.fn() } },
        { provide: PlantsApi, useValue: { getByGarden: vi.fn().mockResolvedValue([]) } },
      ],
    });
    const fixture = TestBed.createComponent(GardenFormDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance as unknown as DialogApi & {
      f: () => { getError: (kind: string) => unknown };
    };
  };

  /** Mirrors the backend's refine: both coordinates, or neither. */
  it.each([
    { label: 'neither coordinate', latitude: null, longitude: null, valid: true },
    { label: 'both coordinates', latitude: 51.05, longitude: 3.72, valid: true },
    { label: 'latitude alone', latitude: 51.05, longitude: null, valid: false },
    { label: 'longitude alone', latitude: null, longitude: 3.72, valid: false },
  ])('$label → group error: $valid', async ({ latitude, longitude, valid }) => {
    const vm = await mountBlank();
    patch(vm, {
      gardenName: 'Bed',
      totalSurfaceArea: 10,
      targetHumidityLevel: 50,
      latitude,
      longitude,
    });

    expect(vm.f().getError('coordinatesTogether') !== undefined).toBe(!valid);
  });
});

describe('GardenFormDialog — every validation message renders', () => {
  type Vm = DialogApi & {
    f: () => { markAsTouched: () => void };
    serverError: { set: (v: string) => void };
  };

  const mountBlank = async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GardenFormDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { garden: null } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: GardensApi, useValue: { create: vi.fn(), update: vi.fn() } },
        { provide: PlantsApi, useValue: { getByGarden: vi.fn().mockResolvedValue([]) } },
      ],
    });
    const fixture = TestBed.createComponent(GardenFormDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    return {
      fixture,
      vm: fixture.componentInstance as unknown as Vm,
      el: fixture.nativeElement as HTMLElement,
    };
  };

  const show = async (values: Record<string, unknown>) => {
    const { fixture, vm, el } = await mountBlank();
    patch(vm, values);
    vm.f().markAsTouched();
    fixture.detectChanges();
    return el.textContent ?? '';
  };

  it('name required', async () => {
    expect(await show({ gardenName: '' })).toContain('Garden name is required');
  });

  it('name cannot be whitespace only', async () => {
    expect(await show({ gardenName: '    ' })).toContain('Garden name is required');
  });

  it('surface area required', async () => {
    expect(await show({ gardenName: 'Bed', totalSurfaceArea: null })).toContain(
      'Surface area is required',
    );
  });

  it('surface area cannot be negative', async () => {
    expect(await show({ gardenName: 'Bed', totalSurfaceArea: -1 })).toContain(
      "Surface area can't be negative",
    );
  });

  it.each([
    { latitude: -91, label: 'below −90' },
    { latitude: 91, label: 'above 90' },
  ])('latitude $label is rejected', async ({ latitude }) => {
    expect(
      await show({ gardenName: 'Bed', totalSurfaceArea: 10, latitude, longitude: 0 }),
    ).toContain('Between −90 and 90');
  });

  it.each([
    { longitude: -181, label: 'below −180' },
    { longitude: 181, label: 'above 180' },
  ])('longitude $label is rejected', async ({ longitude }) => {
    expect(
      await show({ gardenName: 'Bed', totalSurfaceArea: 10, latitude: 0, longitude }),
    ).toContain('Between −180 and 180');
  });

  it('one coordinate without the other is rejected', async () => {
    const text = await show({
      gardenName: 'Bed',
      totalSurfaceArea: 10,
      latitude: 51.05,
      longitude: null,
    });
    expect(text.toLowerCase()).toMatch(/both|coordinate/);
  });

  it('a server error renders inline', async () => {
    const { fixture, vm, el } = await mountBlank();
    vm.serverError.set('The greenhouse rejected that.');
    fixture.detectChanges();
    expect(el.textContent).toContain('The greenhouse rejected that.');
  });

  it('the submit button ghosts while the store is saving — never a spinner', async () => {
    const { fixture, el } = await mountBlank();
    // A real in-flight create: the API never settles, so `saving` stays true
    // and the signal change re-renders the OnPush view (a spy would not).
    const api = TestBed.inject(GardensApi) as unknown as { create: ReturnType<typeof vi.fn> };
    api.create.mockReturnValue(new Promise(() => undefined));
    const store = TestBed.inject(GardensStore);
    void store.create({ gardenName: 'Bed' } as never);
    expect(store.saving()).toBe(true);
    fixture.detectChanges();

    expect(el.querySelector('mat-spinner, .mat-mdc-progress-spinner')).toBeNull();
    // The label stays in the flow (only hidden) so the button keeps its width
    // while the ghost bar covers it.
    const stack = el.querySelector('button[type="submit"] .btn-stack');
    expect(stack?.classList).toContain('is-pending');
    expect(stack?.querySelector('.btn-label')).not.toBeNull();
    expect(stack?.querySelector('.btn-ghost')).not.toBeNull();
  });
});
