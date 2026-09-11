import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Each spec file boots the real app against its own in-memory SQLite, with
    // the case's chaos plugins (10% 500s, 200–2000 ms delay) switched off so
    // every assertion is about the API's own behaviour.
    env: { DB_PATH: ':memory:', API_CHAOS: 'off' },
    server: {
      deps: {
        // @fastify/autoload loads routes and plugins with a native import(),
        // which cannot read TypeScript. Inlining it lets Vitest transform
        // those files, so the real routes and plugins are what gets tested.
        inline: ['@fastify/autoload'],
      },
    },
  },
});
