import Fastify, { FastifyInstance } from 'fastify';
import { app } from '../app/app';

/**
 * The real API — every route, plugin, schema and migration — on a fresh
 * in-memory database (see vitest.config.mts). Requests go through
 * `app.inject()`, so no port is opened.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  await server.register(app);
  await server.ready();
  return server;
}

export const gardenInput = (overrides: Record<string, unknown> = {}) => ({
  gardenName: 'Test garden',
  totalSurfaceArea: 10,
  targetHumidityLevel: 50,
  locationDescription: null,
  latitude: null,
  longitude: null,
  ...overrides,
});

export const plantInput = (gardenId: number, overrides: Record<string, unknown> = {}) => ({
  plantName: 'Basil',
  species: 'Ocimum basilicum',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: 2,
  idealHumidityLevel: 60,
  gardenId,
  ...overrides,
});
