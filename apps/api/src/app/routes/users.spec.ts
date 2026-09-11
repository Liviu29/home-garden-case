import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../testing/build-app';

describe('/users', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(() => app.close());

  const createUser = (emailAddress: string, extra: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/users',
      payload: { firstName: 'Maya', lastName: 'Lin', age: null, emailAddress, ...extra },
    });

  it('creates a profile, lower-casing the email address', async () => {
    const response = await createUser('Maya@Example.COM');

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ emailAddress: 'maya@example.com', firstName: 'Maya' });
  });

  it('finds a profile by id and by email', async () => {
    const { userId } = (await createUser('tom@example.com')).json<{ userId: number }>();

    const byId = await app.inject({ method: 'GET', url: `/users/${userId}` });
    expect(byId.json()).toMatchObject({ userId, emailAddress: 'tom@example.com' });

    const byEmail = await app.inject({ method: 'GET', url: '/users/email/tom@example.com' });
    expect(byEmail.json()).toMatchObject({ userId });
  });

  it('refuses a second profile with the same email with a 409', async () => {
    await createUser('twice@example.com');
    expect((await createUser('twice@example.com')).statusCode).toBe(409);
  });

  it('rejects an invalid email with a 400', async () => {
    expect((await createUser('not-an-email')).statusCode).toBe(400);
  });

  it('answers 404 for a profile that does not exist', async () => {
    expect((await app.inject({ method: 'GET', url: '/users/99999' })).statusCode).toBe(404);
  });

  it('updates and deletes a profile', async () => {
    const { userId } = (await createUser('edit@example.com')).json<{ userId: number }>();

    const updated = await app.inject({
      method: 'PUT',
      url: `/users/${userId}`,
      payload: { firstName: 'Edited', lastName: null, age: 40, emailAddress: 'edit@example.com' },
    });
    expect(updated.json()).toMatchObject({ firstName: 'Edited', age: 40 });

    expect((await app.inject({ method: 'DELETE', url: `/users/${userId}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/users/${userId}` })).statusCode).toBe(404);
  });
});
