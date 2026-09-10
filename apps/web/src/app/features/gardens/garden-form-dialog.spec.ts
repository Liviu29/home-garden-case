import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { Garden, Plant } from '../../core/api/models';
import { PlantsIndexStore } from './plants-index-store';
import { GardenFormDialog } from './garden-form-dialog';

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

describe('GardenFormDialog (shrink-below-used warning, REM-002)', () => {
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

    fixture.componentInstance['form'].controls.totalSurfaceArea.setValue(10);
    await fixture.whenStable();
    fixture.detectChanges();
    const warning = el.querySelector('.form-warning');
    expect(warning?.getAttribute('role')).toBe('alert');
    expect(warning?.textContent).toContain('15');

    // Exactly the used area is allowed without warning (strict <).
    fixture.componentInstance['form'].controls.totalSurfaceArea.setValue(15);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.form-warning')).toBeNull();
  });

  it('never warns when creating a new garden', async () => {
    const fixture = await mount({ garden: null });
    fixture.componentInstance['form'].controls.totalSurfaceArea.setValue(0.5);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.form-warning')).toBeNull();
  });

  it('a size preset writes through the form control (and highlights its chip)', async () => {
    const fixture = await mount({ garden: null });
    const el: HTMLElement = fixture.nativeElement;

    const large = [...el.querySelectorAll<HTMLButtonElement>('button.preset')].find((b) =>
      b.textContent?.includes('Large'),
    )!;
    large.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance['form'].controls.totalSurfaceArea.value).toBe(50);
    expect(fixture.componentInstance['form'].controls.totalSurfaceArea.dirty).toBe(true);
    expect(large.getAttribute('aria-pressed')).toBe('true');
  });

  it('a humidity preset still passes through the 0–100 validators, and custom values remain possible', async () => {
    const fixture = await mount({ garden: null });
    const el: HTMLElement = fixture.nativeElement;

    const balanced = [...el.querySelectorAll<HTMLButtonElement>('button.preset')].find((b) =>
      b.textContent?.includes('Balanced'),
    )!;
    balanced.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const humidity = fixture.componentInstance['form'].controls.targetHumidityLevel;
    expect(humidity.value).toBe(60);
    expect(humidity.valid).toBe(true);

    // Custom values are first-class: presets never lock the field…
    humidity.setValue(73);
    expect(humidity.valid).toBe(true);
    // …and the validator (not the preset list) remains the authority.
    humidity.setValue(140);
    expect(humidity.hasError('max')).toBe(true);
  });

  it('exactly one preset per group carries the Recommended badge', async () => {
    const fixture = await mount({ garden: null });
    const badges = (fixture.nativeElement as HTMLElement).querySelectorAll('.recommended-badge');
    expect(badges).toHaveLength(2); // one for size, one for humidity
  });
});
