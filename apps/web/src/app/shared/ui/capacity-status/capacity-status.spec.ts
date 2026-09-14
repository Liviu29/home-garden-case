import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Garden, Plant } from '../../../core/api/models';
import { CAPACITY_STATUS_TONE, CapacityStatusChip } from './capacity-status';

const garden = (totalSurfaceArea: number): Garden => ({
  gardenId: 1,
  gardenName: 'G',
  totalSurfaceArea,
  targetHumidityLevel: 50,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
});

const plant = (surfaceAreaRequired: number): Plant => ({
  plantId: 1,
  plantName: 'P',
  species: 's',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired,
  idealHumidityLevel: 50,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

@Component({
  imports: [CapacityStatusChip],
  template: `<app-capacity-status [garden]="garden()" [plants]="plants()" />`,
})
class Host {
  readonly garden = signal(garden(20));
  readonly plants = signal<readonly Plant[]>([]);
}

/**
 * The domain wrapper. Its value is that the chip's label and tone come from
 * `garden-insights` rather than from a second opinion in the template — so a
 * threshold change lands in one place.
 */
describe('CapacityStatusChip', () => {
  const render = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  };

  it('maps every domain status to exactly one presentation tone', () => {
    expect(CAPACITY_STATUS_TONE).toEqual({
      healthy: 'success',
      approaching: 'neutral',
      'almost-full': 'warning',
      full: 'critical',
    });
  });

  it.each([
    { used: 0, label: 'Healthy capacity', tone: 'success' },
    { used: 14, label: 'Approaching capacity', tone: 'neutral' },
    { used: 18, label: 'Almost full', tone: 'warning' },
    { used: 20, label: 'Full', tone: 'critical' },
  ])('renders "$label" at $used m² of 20', ({ used, label, tone }) => {
    const fixture = render();
    fixture.componentInstance.plants.set(used > 0 ? [plant(used)] : []);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(label);
    expect(el.querySelector('.chip')?.classList).toContain(tone);
  });

  it('re-derives when the plant set changes', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Healthy capacity');

    fixture.componentInstance.plants.set([plant(20)]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Full');
  });
});
