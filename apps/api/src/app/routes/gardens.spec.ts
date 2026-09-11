import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, gardenInput, plantInput } from '../../testing/build-app';

describe('/gardens', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(() => app.close());

  const createGarden = async (overrides: Record<string, unknown> = {}) => {
    const response = await app.inject({
      method: 'POST',
      url: '/gardens',
      payload: gardenInput(overrides),
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ gardenId: number; totalSurfaceArea: number }>();
  };

  const addPlant = (gardenId: number, surfaceAreaRequired: number) =>
    app.inject({
      method: 'POST',
      url: '/plants',
      payload: plantInput(gardenId, { surfaceAreaRequired }),
    });

  it('creates a garden and returns it with its id and timestamps', async () => {
    const garden = await createGarden({ gardenName: '  Rooftop  ', targetHumidityLevel: 65 });

    expect(garden).toMatchObject({ gardenName: 'Rooftop', targetHumidityLevel: 65 });
    expect(garden.gardenId).toBeGreaterThan(0);
  });

  it('lists and reads gardens back', async () => {
    const { gardenId } = await createGarden({ gardenName: 'Listed' });

    const list = await app.inject({ method: 'GET', url: '/gardens' });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ gardenId: number }[]>().map((g) => g.gardenId)).toContain(gardenId);

    const one = await app.inject({ method: 'GET', url: `/gardens/${gardenId}` });
    expect(one.json()).toMatchObject({ gardenId, gardenName: 'Listed' });
  });

  it('answers 404 for a garden that does not exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/gardens/99999' });
    expect(response.statusCode).toBe(404);
  });

  it.each([
    ['an empty name', { gardenName: '' }],
    ['a negative surface', { totalSurfaceArea: -1 }],
    ['a humidity above 100', { targetHumidityLevel: 101 }],
    ['a latitude without a longitude', { latitude: 50 }],
  ])('rejects %s with a 400', async (_, overrides) => {
    const response = await app.inject({
      method: 'POST',
      url: '/gardens',
      payload: gardenInput(overrides),
    });
    expect(response.statusCode).toBe(400);
  });

  it('updates a garden', async () => {
    const { gardenId } = await createGarden();

    const response = await app.inject({
      method: 'PUT',
      url: `/gardens/${gardenId}`,
      payload: gardenInput({ gardenName: 'Renamed', totalSurfaceArea: 30 }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ gardenName: 'Renamed', totalSurfaceArea: 30 });
  });

  describe('capacity on update', () => {
    it('refuses to shrink a garden below the area its plants already use', async () => {
      const { gardenId } = await createGarden({ totalSurfaceArea: 10 });
      expect((await addPlant(gardenId, 4)).statusCode).toBe(201);
      expect((await addPlant(gardenId, 3)).statusCode).toBe(201);

      const response = await app.inject({
        method: 'PUT',
        url: `/gardens/${gardenId}`,
        payload: gardenInput({ totalSurfaceArea: 6.5 }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'Validation error',
        details: [expect.stringContaining('its plants already require 7m²')],
      });
      const unchanged = await app.inject({ method: 'GET', url: `/gardens/${gardenId}` });
      expect(unchanged.json()).toMatchObject({ totalSurfaceArea: 10 });
    });

    it('allows shrinking exactly to the used area', async () => {
      const { gardenId } = await createGarden({ totalSurfaceArea: 10 });
      await addPlant(gardenId, 7);

      const response = await app.inject({
        method: 'PUT',
        url: `/gardens/${gardenId}`,
        payload: gardenInput({ totalSurfaceArea: 7 }),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  it('deletes a garden together with its plants', async () => {
    const { gardenId } = await createGarden();
    const plant = (await addPlant(gardenId, 1)).json<{ plantId: number }>();

    const response = await app.inject({ method: 'DELETE', url: `/gardens/${gardenId}` });

    expect(response.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/gardens/${gardenId}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/plants/${plant.plantId}` })).statusCode).toBe(
      404,
    );
  });

  it('answers 404 when deleting a garden that does not exist', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/gardens/99999' });
    expect(response.statusCode).toBe(404);
  });
});
