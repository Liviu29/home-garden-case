import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '../errors/api-error';
import type { PlantDto } from './dtos';
import type { PlantInput } from './models';
import { PlantsApi } from './plants-api';

const plantDto = (plantId: number, extra: Partial<PlantDto> = {}): PlantDto => ({
  plantId,
  plantName: `Plant ${plantId}`,
  species: 'Ocimum basilicum',
  plantType: 'vegetable',
  plantationDate: '2026-03-28T00:00:00.000Z',
  surfaceAreaRequired: 0.5,
  idealHumidityLevel: 60,
  gardenId: 3,
  createdAt: '2026-03-28T00:00:00.000Z',
  updatedAt: '2026-03-28T00:00:00.000Z',
  ...extra,
});

const input: PlantInput = {
  plantName: 'Basil',
  species: 'Ocimum basilicum',
  plantType: 'vegetable',
  plantationDate: '2026-03-28T00:00:00.000Z',
  surfaceAreaRequired: 0.5,
  idealHumidityLevel: 60,
  gardenId: 3,
};

/** The /plants client — same contract as GardensApi: right route, mapped result, typed failure. */
describe('PlantsApi', () => {
  let api: PlantsApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PlantsApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it("lists a garden's plants and maps each one to the domain shape", async () => {
    const pending = api.getByGarden(3);
    controller
      .expectOne('/plants/garden/3')
      .flush([plantDto(1), plantDto(2, { plantType: 'fruit' })]);

    const plants = await pending;
    expect(plants.map((p) => p.plantId)).toEqual([1, 2]);
    expect(plants[1]).toMatchObject({ plantType: 'fruit', surfaceAreaRequired: 0.5, gardenId: 3 });
  });

  it('lists every plant across gardens in a single request', async () => {
    const pending = api.getAll();
    controller.expectOne('/plants').flush([plantDto(1), plantDto(2, { gardenId: 4 })]);

    const plants = await pending;
    expect(plants.map((p) => [p.plantId, p.gardenId])).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it('asks only for the plants a profile can see with ?visibleTo', async () => {
    const pending = api.getAll(5);
    const request = controller.expectOne((r) => r.url === '/plants' && r.method === 'GET');
    expect(request.request.params.get('visibleTo')).toBe('5');
    request.flush([plantDto(1)]);
    await expect(pending).resolves.toHaveLength(1);
  });

  it('creates with a POST carrying the form input', async () => {
    const pending = api.create(input);
    const request = controller.expectOne('/plants');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(plantDto(9, { plantName: 'Basil' }));
    await expect(pending).resolves.toMatchObject({ plantId: 9, plantName: 'Basil' });
  });

  it('updates with a full-payload PUT (the backend rejects partials)', async () => {
    const pending = api.update(9, input);
    const request = controller.expectOne('/plants/9');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(input);
    request.flush(plantDto(9, { idealHumidityLevel: 60 }));
    await expect(pending).resolves.toMatchObject({ plantId: 9, idealHumidityLevel: 60 });
  });

  it('deletes and resolves to void', async () => {
    const pending = api.delete(9);
    const request = controller.expectOne('/plants/9');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await expect(pending).resolves.toBeUndefined();
  });

  it('surfaces a 400 capacity verdict as a functional ApiError the form can render', async () => {
    const pending = api.create({ ...input, surfaceAreaRequired: 50 });
    controller
      .expectOne('/plants')
      .flush(
        { message: 'Not enough surface area available in this garden' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({ kind: 'functional', status: 400 });
  });
});
