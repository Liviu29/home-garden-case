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
 * the container's layout by default).
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const port = process.env.PORT ?? '8080';
const apiPort = process.env.API_PORT ?? '3000';
const apiMain = process.env.API_MAIN ?? join(root, 'api', 'main.js');
const webRoot = process.env.WEB_ROOT ?? join(root, 'web');

const children = [
  // The API listens on loopback only: the proxy is its one client.
  spawn(process.execPath, [apiMain], {
    stdio: 'inherit',
    env: { ...process.env, HOST: '127.0.0.1', PORT: apiPort },
  }),
  spawn(
    process.execPath,
    [
      join(here, 'serve-dist.mjs'),
      '--port',
      port,
      '--root',
      webRoot,
      '--api',
      `http://127.0.0.1:${apiPort}`,
    ],
    { stdio: 'inherit' },
  ),
];

let stopping = false;
const stop = (code) => {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  process.exitCode = code;
};

for (const child of children) {
  child.on('exit', (code) => stop(code ?? 1));
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}
