import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Garden, Plant } from '../../core/api/models';
import { PlantFormDialog, PlantFormData } from './plant-form-dialog';

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

describe('PlantFormDialog (capacity behaviour, the reviewer-facing rule)', () => {
  it('shows the live garden-fit breakdown: available / this plant / remaining', async () => {
    const store = storeStub();
    const fixture = await mount({ garden, plants: [existingPlant], plant: null, store });

    fixture.componentInstance['form'].controls.surfaceAreaRequired.setValue(3);
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

    fixture.componentInstance['form'].patchValue({
      plantName: 'Pumpkin',
      species: 'Cucurbita maxima',
      surfaceAreaRequired: 7, // only 4 m² available
    });
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

    fixture.componentInstance['form'].patchValue({
      plantName: 'Lettuce',
      species: 'Lactuca sativa',
      surfaceAreaRequired: 4, // exactly the remaining capacity
    });
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
    fixture.componentInstance['form'].controls.surfaceAreaRequired.setValue(10);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    await fixture.componentInstance['submit']();
    expect(store.updatePlant).toHaveBeenCalledOnce();

    // 10.5 m² does not.
    fixture.componentInstance['form'].controls.surfaceAreaRequired.setValue(10.5);
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
    expect(fixture.componentInstance['form'].controls.surfaceAreaRequired.value).toBe(2);
    expect(el.textContent).toContain('only');
    await fixture.componentInstance['submit']();
    expect(store.createPlant).not.toHaveBeenCalled();
  });
});
