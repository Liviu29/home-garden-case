import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * This plugin adds random delays to simulate a slow API.
 * Useful for testing and development.
 */
export default fp(async function (fastify: FastifyInstance) {
  // On by default, as the case requires; `API_CHAOS=off` turns it off for the API's own tests.
  const enabled = process.env['API_CHAOS'] !== 'off';
  const minDelay = 200;
  const maxDelay = 2000;

  if (!enabled) {
    fastify.log.info('Slow API plugin is disabled');
    return;
  }

  fastify.log.info(`Slow API plugin enabled with delays between ${minDelay}ms and ${maxDelay}ms`);

  fastify.addHook('onSend', async (request) => {
    // Never throw errors on docs routes
    const url = request.url;
    if (url.startsWith('/docs')) {
      return;
    }

    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    await new Promise((resolve) => setTimeout(resolve, delay));
  });
});
