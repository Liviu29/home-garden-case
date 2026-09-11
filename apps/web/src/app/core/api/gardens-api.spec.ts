import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '../errors/api-error';
import { GardenDto } from './dtos';
import { GardensApi } from './gardens-api';
import { GardenInput } from './models';

const gardenDto = (gardenId: number, extra: Partial<GardenDto> = {}): GardenDto => ({
  gardenId,
  gardenName: `Garden ${gardenId}`,
  totalSurfaceArea: 20,
  targetHumidityLevel: 50,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const input: GardenInput = {
  gardenName: 'Back Garden',
  totalSurfaceArea: 20,
  targetHumidityLevel: 55,
  locationDescription: null,
  latitude: null,
  longitude: null,
};

/**
 * The /gardens client is thin on purpose, so its spec pins exactly its two
 * jobs: each call hits the right route with the right verb and body, and each
 * response is mapped to the domain shape. Failures surface as typed ApiErrors.
 */
describe('GardensApi', () => {
  let api: GardensApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(GardensApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('lists gardens and turns absent optional fields into explicit nulls', async () => {
    const pending = api.getAll();
    controller
      .expectOne('/gardens')
      .flush([
        gardenDto(1),
        gardenDto(2, { locationDescription: 'Balcony', latitude: 51.05, longitude: 3.72 }),
      ]);

    const gardens = await pending;
    expect(gardens).toHaveLength(2);
    expect(gardens[0]).toMatchObject({
      gardenId: 1,
      locationDescription: null,
      latitude: null,
      longitude: null,
    });
    expect(gardens[1]).toMatchObject({
      locationDescription: 'Balcony',
      latitude: 51.05,
      longitude: 3.72,
    });
  });

  it('fetches one garden by id', async () => {
    const pending = api.getById(7);
    controller.expectOne('/gardens/7').flush(gardenDto(7));
    await expect(pending).resolves.toMatchObject({ gardenId: 7, targetHumidityLevel: 50 });
  });

  it('creates with a POST carrying the form input', async () => {
    const pending = api.create(input);
    const request = controller.expectOne('/gardens');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(gardenDto(8, { gardenName: 'Back Garden' }));
    await expect(pending).resolves.toMatchObject({ gardenId: 8, gardenName: 'Back Garden' });
  });

  it('updates with a full-payload PUT', async () => {
    const pending = api.update(8, input);
    const request = controller.expectOne('/gardens/8');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(input);
    request.flush(gardenDto(8, { targetHumidityLevel: 55 }));
    await expect(pending).resolves.toMatchObject({ gardenId: 8, targetHumidityLevel: 55 });
  });

  it('deletes and resolves to void', async () => {
    const pending = api.delete(8);
    const request = controller.expectOne('/gardens/8');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await expect(pending).resolves.toBeUndefined();
  });

  it('surfaces a 404 as a typed not-found ApiError, never a raw HttpErrorResponse', async () => {
    const pending = api.getById(99);
    controller
      .expectOne('/gardens/99')
      .flush({ message: 'Garden not found' }, { status: 404, statusText: 'Not Found' });

    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('surfaces a server 500 as a technical ApiError', async () => {
    const pending = api.getAll();
    controller
      .expectOne('/gardens')
      .flush(
        { error: 'Internal server error', details: ['Random error thrown'] },
        { status: 500, statusText: 'Internal Server Error' },
      );

    await expect(pending).rejects.toMatchObject({ kind: 'technical', status: 500 });
  });
});
