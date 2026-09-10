/**
 * Minimal static host for the production build — the two things a real host
 * must do, and nothing else:
 *
 *   1. SPA fallback: unknown paths serve index.html so deep links such as
 *      /gardens/1 survive a hard refresh (client-side routing).
 *   2. Same-origin API: /api/* is reverse-proxied to the Fastify backend,
 *      which is why the app ships a relative `apiBaseUrl` and the backend
 *      needs no CORS policy.
 *
 * Zero dependencies on purpose — this is a preview harness, not a deployment
 * target. See docs/PRODUCTION-READINESS.md for the real hosting requirements.
 *
 *   node tools/serve-dist.mjs [--port 4300] [--api http://localhost:3000]
 */
import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const root = resolve(flag('root', 'apps/web/dist/web/browser'));
const port = Number(flag('port', '4300'));
const apiTarget = new URL(flag('api', 'http://localhost:3000'));

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No build found at ${root} — run \`npm run build:web\` first.`);
  process.exit(1);
}

const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const proxied = httpRequest(
      {
        hostname: apiTarget.hostname,
        port: apiTarget.port,
        // The dev proxy strips the /api prefix; production must match it.
        path: url.pathname.replace(/^\/api/, '') + url.search,
        method: req.method,
        headers: { ...req.headers, host: apiTarget.host },
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxied.on('error', () => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unreachable', details: [apiTarget.origin] }));
    });
    req.pipe(proxied);
    return;
  }

  // Contain path traversal before touching the filesystem.
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(root, requested);
  const file =
    candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(root, 'index.html');

  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    // Hashed assets are immutable; index.html must never be cached.
    'cache-control': file.endsWith('index.html')
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`[ preview ] http://localhost:${port}  (root ${root}, /api → ${apiTarget.origin})`);
});
