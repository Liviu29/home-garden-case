import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, gardenInput, plantInput } from '../../testing/build-app';

describe('/plants', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(() => app.close());

  const createGarden = async (totalSurfaceArea = 10): Promise<number> => {
    const response = await app.inject({
      method: 'POST',
      url: '/gardens',
      payload: gardenInput({ totalSurfaceArea }),
    });
    return response.json<{ gardenId: number }>().gardenId;
  };

  const createPlant = (gardenId: number, overrides: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: '/plants', payload: plantInput(gardenId, overrides) });

  it('creates a plant and lists it under its garden', async () => {
    const gardenId = await createGarden();

    const created = await createPlant(gardenId, { plantName: '  Mint  ' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ plantName: 'Mint', gardenId });

    const list = await app.inject({ method: 'GET', url: `/plants/garden/${gardenId}` });
    expect(list.json()).toHaveLength(1);
  });

  it('GET /plants returns every plant across gardens in one request', async () => {
    const first = await createGarden();
    const second = await createGarden();
    await createPlant(first);
    await createPlant(second);
    await createPlant(second);

    const response = await app.inject({ method: 'GET', url: '/plants' });

    expect(response.statusCode).toBe(200);
    const byGarden = response
      .json<{ gardenId: number }[]>()
      .filter((p) => p.gardenId === first || p.gardenId === second)
      .map((p) => p.gardenId);
    expect(byGarden.sort()).toEqual([first, second, second].sort());
  });

  it('answers 400 when listing the plants of a garden that does not exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/plants/garden/99999' });
    expect(response.statusCode).toBe(400);
  });

  it('answers 404 for a plant that does not exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/plants/99999' });
    expect(response.statusCode).toBe(404);
  });

  it.each([
    ['an unknown plant type', { plantType: 'tree' }],
    ['a negative surface', { surfaceAreaRequired: -1 }],
    ['a humidity above 100', { idealHumidityLevel: 120 }],
    ['a date that is not ISO', { plantationDate: 'yesterday' }],
  ])('rejects %s with a 400', async (_, overrides) => {
    const gardenId = await createGarden();
    expect((await createPlant(gardenId, overrides)).statusCode).toBe(400);
  });

  it('answers 404 when the plant’s garden does not exist', async () => {
    expect((await createPlant(99999)).statusCode).toBe(404);
  });

  describe('capacity', () => {
    it('accepts a plant that fills the garden exactly, and refuses one more m²', async () => {
      const gardenId = await createGarden(5);
      expect((await createPlant(gardenId, { surfaceAreaRequired: 5 })).statusCode).toBe(201);

      const refused = await createPlant(gardenId, { surfaceAreaRequired: 1 });

      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({
        error: 'Validation error',
        details: [expect.stringContaining('would exceed')],
      });
    });

    it('does not count the plant being edited against itself', async () => {
      const gardenId = await createGarden(5);
      const plant = (await createPlant(gardenId, { surfaceAreaRequired: 4 })).json<{
        plantId: number;
      }>();

      const grown = await app.inject({
        method: 'PUT',
        url: `/plants/${plant.plantId}`,
        payload: plantInput(gardenId, { surfaceAreaRequired: 5 }),
      });
      expect(grown.statusCode).toBe(200);

      const tooBig = await app.inject({
        method: 'PUT',
        url: `/plants/${plant.plantId}`,
        payload: plantInput(gardenId, { surfaceAreaRequired: 6 }),
      });
      expect(tooBig.statusCode).toBe(400);
    });

    it('checks the destination garden when a plant moves', async () => {
      const from = await createGarden(10);
      const to = await createGarden(1);
      const plant = (await createPlant(from, { surfaceAreaRequired: 2 })).json<{
        plantId: number;
      }>();

      const response = await app.inject({
        method: 'PUT',
        url: `/plants/${plant.plantId}`,
        payload: plantInput(to, { surfaceAreaRequired: 2 }),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  it('deletes a plant', async () => {
    const gardenId = await createGarden();
    const plant = (await createPlant(gardenId)).json<{ plantId: number }>();

    expect(
      (await app.inject({ method: 'DELETE', url: `/plants/${plant.plantId}` })).statusCode,
    ).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/plants/${plant.plantId}` })).statusCode).toBe(
      404,
    );
  });
});
