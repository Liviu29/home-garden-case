import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Idempotent POSTs (ADR-004).
 *
 * A client can never be sure a POST did not land: the connection may drop
 * after the handler ran, and this API holds every response for 200–2000 ms
 * on purpose, which makes that window wide. A POST that carries an
 * `Idempotency-Key` header is therefore remembered once it has succeeded,
 * and repeating it with the same key returns the first attempt's response —
 * same status, same body — instead of creating a second row. That is what
 * lets the frontend retry a failed POST without risking a duplicate.
 *
 * Scope: a key belongs to one method and URL, so the same key on two
 * different endpoints is two requests. Only 2xx responses are remembered; a
 * 400 or 500 is not, so the client's next attempt runs the handler again.
 * Entries live for ten minutes, bounded to the newest thousand, in memory:
 * this API is one process on one SQLite file, and a deployment with several
 * instances would move the table into the database.
 */
const HEADER = 'idempotency-key';
const REPLAY_HEADER = 'idempotency-replayed';
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 1_000;
const MAX_KEY_LENGTH = 200;

interface RememberedResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
  readonly expiresAt: number;
}

/** The store key for a request, or null for requests the plugin ignores. */
function keyOf(request: FastifyRequest): string | null {
  if (request.method !== 'POST') {
    return null;
  }
  const key = request.headers[HEADER];
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    return null;
  }
  return `${request.method} ${request.url} ${key}`;
}

export default fp(async function (fastify: FastifyInstance) {
  const remembered = new Map<string, RememberedResponse>();

  // Before the handler: a repeated key answers from memory.
  fastify.addHook('preHandler', async (request, reply) => {
    const key = keyOf(request);
    if (key === null) {
      return;
    }
    const hit = remembered.get(key);
    if (!hit) {
      return;
    }
    if (hit.expiresAt <= Date.now()) {
      remembered.delete(key);
      return;
    }
    reply.header(REPLAY_HEADER, 'true');
    reply.header('content-type', hit.contentType);
    await reply.code(hit.status).send(hit.body);
    return reply;
  });

  // After the handler: a successful response is remembered for its key.
  fastify.addHook('onSend', async (request, reply, payload) => {
    const key = keyOf(request);
    const replayed = reply.getHeader(REPLAY_HEADER) === 'true';
    if (key === null || replayed || reply.statusCode >= 300 || typeof payload !== 'string') {
      return payload;
    }
    if (remembered.size >= MAX_ENTRIES) {
      // Map iterates in insertion order: the first key is the oldest entry.
      const oldest = remembered.keys().next().value;
      if (oldest !== undefined) {
        remembered.delete(oldest);
      }
    }
    remembered.set(key, {
      status: reply.statusCode,
      contentType: String(reply.getHeader('content-type') ?? 'application/json; charset=utf-8'),
      body: payload,
      expiresAt: Date.now() + TTL_MS,
    });
    return payload;
  });
});
