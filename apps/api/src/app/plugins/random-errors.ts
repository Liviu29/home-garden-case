import { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * This plugin randomly throws errors to simulate API failures.
 * Useful for testing error handling and retry logic.
 */
export default fp(async function (fastify: FastifyInstance) {
  // On by default, as the case requires; `API_CHAOS=off` turns it off for the API's own tests.
  const enabled = process.env['API_CHAOS'] !== 'off';
  const errorRate = 10;
  const rate = Math.max(0, Math.min(100, errorRate));
  const statusCode = 500;

  if (!enabled) {
    fastify.log.info('Random errors plugin is disabled');
    return;
  }

  fastify.log.info(
    `Random errors plugin enabled with ${rate}% error rate and status code ${statusCode}`,
  );

  fastify.addHook('onRequest', async (request) => {
    // Never throw errors on docs routes
    const url = request.url;
    if (url.startsWith('/docs')) {
      return;
    }

    const randomValue = Math.random() * 100;
    if (randomValue < rate) {
      fastify.log.info(
        `Random error thrown with ${rate}% error rate and status code ${statusCode}`,
      );
      const error = new Error('Random error thrown') as FastifyError;
      error.statusCode = statusCode;
      throw error;
    }
  });
});
