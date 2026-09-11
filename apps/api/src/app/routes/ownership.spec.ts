import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, gardenInput, plantInput } from '../../testing/build-app';

/** Profiles own their gardens (ADR-009); unowned gardens are shared with everyone. */
describe('garden ownership', () => {
  let app: FastifyInstance;
  let emails = 0;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(() => app.close());

  const createProfile = async (): Promise<number> => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        firstName: 'Owner',
        lastName: null,
        age: null,
        emailAddress: `owner${++emails}@example.com`,
      },
    });
    return response.json<{ userId: number }>().userId;
  };

  const createGarden = (overrides: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: '/gardens', payload: gardenInput(overrides) });

  const gardenIdOf = async (overrides: Record<string, unknown> = {}): Promise<number> =>
    (await createGarden(overrides)).json<{ gardenId: number }>().gardenId;

  const listIds = async (url: string): Promise<number[]> =>
    (await app.inject({ method: 'GET', url }))
      .json<{ gardenId: number }[]>()
      .map((g) => g.gardenId);

  it('a garden records the profile that owns it; without one it is shared', async () => {
    const maya = await createProfile();

    const owned = await createGarden({ gardenName: "Maya's bed", userId: maya });
    const shared = await createGarden({ gardenName: 'Community bed' });

    expect(owned.statusCode).toBe(201);
    expect(owned.json()).toMatchObject({ userId: maya });
    expect(shared.json()).toMatchObject({ userId: null });
  });

  it("visibleTo lists a profile's own gardens and the shared ones — never another profile's", async () => {
    const maya = await createProfile();
    const tom = await createProfile();
    const mine = await gardenIdOf({ userId: maya });
    const theirs = await gardenIdOf({ userId: tom });
    const shared = await gardenIdOf();

    const visible = await listIds(`/gardens?visibleTo=${maya}`);

    expect(visible).toEqual(expect.arrayContaining([mine, shared]));
    expect(visible).not.toContain(theirs);
    // Without the filter the endpoint still lists everything, as the case's API did.
    expect(await listIds('/gardens')).toEqual(expect.arrayContaining([mine, theirs, shared]));
  });

  it('visibleTo filters the plants the same way', async () => {
    const maya = await createProfile();
    const tom = await createProfile();
    const mine = await gardenIdOf({ userId: maya });
    const theirs = await gardenIdOf({ userId: tom });
    await app.inject({ method: 'POST', url: '/plants', payload: plantInput(mine) });
    await app.inject({ method: 'POST', url: '/plants', payload: plantInput(theirs) });

    const response = await app.inject({ method: 'GET', url: `/plants?visibleTo=${maya}` });
    const gardens = response.json<{ gardenId: number }[]>().map((p) => p.gardenId);

    expect(gardens).toContain(mine);
    expect(gardens).not.toContain(theirs);
  });

  it('refuses an owner that does not exist, on create and on update', async () => {
    const created = await createGarden({ userId: 99999 });
    expect(created.statusCode).toBe(400);
    expect(created.json()).toMatchObject({
      details: [expect.stringContaining('Profile with ID 99999 not found')],
    });

    const gardenId = await gardenIdOf();
    const updated = await app.inject({
      method: 'PUT',
      url: `/gardens/${gardenId}`,
      payload: gardenInput({ userId: 99999 }),
    });
    expect(updated.statusCode).toBe(400);
  });

  it('an update that does not mention the owner keeps it', async () => {
    const maya = await createProfile();
    const gardenId = await gardenIdOf({ userId: maya });

    const response = await app.inject({
      method: 'PUT',
      url: `/gardens/${gardenId}`,
      payload: gardenInput({ gardenName: 'Renamed' }),
    });

    expect(response.json()).toMatchObject({ gardenName: 'Renamed', userId: maya });
  });

  it('rejects a visibleTo that is not a profile id', async () => {
    const response = await app.inject({ method: 'GET', url: '/gardens?visibleTo=abc' });
    expect(response.statusCode).toBe(400);
  });

  it('deleting a profile hands its gardens back to everyone', async () => {
    const maya = await createProfile();
    const tom = await createProfile();
    const gardenId = await gardenIdOf({ userId: maya });

    expect((await app.inject({ method: 'DELETE', url: `/users/${maya}` })).statusCode).toBe(204);

    const garden = await app.inject({ method: 'GET', url: `/gardens/${gardenId}` });
    expect(garden.json()).toMatchObject({ userId: null });
    expect(await listIds(`/gardens?visibleTo=${tom}`)).toContain(gardenId);
  });
});
