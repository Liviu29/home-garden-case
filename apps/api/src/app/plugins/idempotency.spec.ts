import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, gardenInput, plantInput } from '../../testing/build-app';

describe('Idempotency-Key on POST', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(() => app.close());

  const post = (url: string, payload: Record<string, unknown>, key?: string) =>
    app.inject({
      method: 'POST',
      url,
      payload,
      headers: key === undefined ? {} : { 'idempotency-key': key },
    });

  const gardenCount = async (name: string) => {
    const list = await app.inject({ method: 'GET', url: '/gardens' });
    return list.json<{ gardenName: string }[]>().filter((g) => g.gardenName === name).length;
  };

  it('repeating a POST with the same key returns the first response and creates nothing', async () => {
    const first = await post('/gardens', gardenInput({ gardenName: 'Once' }), 'key-once');
    const again = await post('/gardens', gardenInput({ gardenName: 'Once' }), 'key-once');

    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(201);
    expect(again.json()).toEqual(first.json());
    expect(again.headers['idempotency-replayed']).toBe('true');
    expect(first.headers['idempotency-replayed']).toBeUndefined();
    expect(await gardenCount('Once')).toBe(1);
  });

  it('a different key is a different request', async () => {
    const a = await post('/gardens', gardenInput({ gardenName: 'Twice' }), 'key-a');
    const b = await post('/gardens', gardenInput({ gardenName: 'Twice' }), 'key-b');

    expect(a.json<{ gardenId: number }>().gardenId).not.toBe(
      b.json<{ gardenId: number }>().gardenId,
    );
    expect(await gardenCount('Twice')).toBe(2);
  });

  it('a key belongs to one URL: the same key on another endpoint runs that handler', async () => {
    const garden = await post('/gardens', gardenInput({ gardenName: 'Scoped' }), 'shared-key');
    const { gardenId } = garden.json<{ gardenId: number }>();

    const plant = await post('/plants', plantInput(gardenId), 'shared-key');

    expect(plant.statusCode).toBe(201);
    expect(plant.headers['idempotency-replayed']).toBeUndefined();
    expect(plant.json()).toMatchObject({ plantName: 'Basil', gardenId });
  });

  it('without a key, every POST is its own request (the behaviour the case ships with)', async () => {
    await post('/gardens', gardenInput({ gardenName: 'Unkeyed' }));
    await post('/gardens', gardenInput({ gardenName: 'Unkeyed' }));

    expect(await gardenCount('Unkeyed')).toBe(2);
  });

  it('a refused POST is not remembered: the corrected retry runs the handler', async () => {
    const refused = await post('/gardens', gardenInput({ gardenName: '' }), 'key-fixed');
    expect(refused.statusCode).toBe(400);

    const accepted = await post('/gardens', gardenInput({ gardenName: 'Fixed' }), 'key-fixed');

    expect(accepted.statusCode).toBe(201);
    expect(accepted.headers['idempotency-replayed']).toBeUndefined();
    expect(await gardenCount('Fixed')).toBe(1);
  });
});
