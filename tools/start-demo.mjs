/**
 * The demo container's entry point (see the Dockerfile): the API on a private
 * port, and the built SPA with the same-origin /api proxy on the public one
 * (tools/serve-dist.mjs). When either process exits, the other is stopped and
 * the container exits with it, so the platform restarts both together.
 *
 *   node tools/start-demo.mjs
 *
 * Environment: PORT (public, default 8080), API_PORT (private, default 3000),
 * DB_PATH (the SQLite file), API_MAIN and WEB_ROOT (where the builds are;
 * the container's layout by default). DEMO_SEED=1 adds the demo profiles and
 * gardens once the API answers (tools/seed-demo.mjs): on a host without a
 * persistent disk the database starts empty on every boot, and on one with a
 * disk the seed only adds what is missing.
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const port = process.env.PORT ?? '8080';
const apiPort = process.env.API_PORT ?? '3000';
const apiMain = process.env.API_MAIN ?? join(root, 'api', 'main.js');
const webRoot = process.env.WEB_ROOT ?? join(root, 'web');
const api = `http://127.0.0.1:${apiPort}`;

const children = [
  // The API listens on loopback only: the proxy is its one client.
  spawn(process.execPath, [apiMain], {
    stdio: 'inherit',
    env: { ...process.env, HOST: '127.0.0.1', PORT: apiPort },
  }),
  spawn(
    process.execPath,
    [join(here, 'serve-dist.mjs'), '--port', port, '--root', webRoot, '--api', api],
    { stdio: 'inherit' },
  ),
];

/** The seed runs beside the servers; it never takes the container down. */
let seeder = null;

let stopping = false;
const stop = (code) => {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of [...children, seeder]) {
    child?.kill('SIGTERM');
  }
  process.exitCode = code;
};

for (const child of children) {
  child.on('exit', (code) => stop(code ?? 1));
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}

/** Any HTTP answer means the API is up — even one of its deliberate 500s. */
async function apiAnswers() {
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      await fetch(`${api}/users`);
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

if (process.env.DEMO_SEED === '1') {
  if (await apiAnswers()) {
    seeder = spawn(process.execPath, [join(here, 'seed-demo.mjs')], {
      stdio: 'inherit',
      env: { ...process.env, SEED_API: api },
    });
    seeder.on('exit', (code) => {
      seeder = null;
      if (code !== 0 && !stopping) {
        console.error(
          `[demo] the demo data could not be added (exit ${code}); the app runs without it`,
        );
      }
    });
  } else if (!stopping) {
    console.error('[demo] the API did not answer within a minute; no demo data added');
  }
}
