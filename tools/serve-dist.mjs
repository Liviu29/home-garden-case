/**
 * Minimal static host for the production build — the things a real host
 * must do, and nothing else:
 *
 *   1. SPA fallback: unknown paths serve index.html so deep links such as
 *      /gardens/1 survive a hard refresh (client-side routing).
 *   2. Same-origin API: /api/* is reverse-proxied to the Fastify backend,
 *      which is why the app ships a relative `apiBaseUrl` and the backend
 *      needs no CORS policy.
 *   3. Languages: the production build is compiled once per language, into
 *      /en/ and /nl/. Each has its own SPA fallback, and any other path is
 *      redirected into one — the `lang` cookie the switcher sets, else the
 *      browser's Accept-Language, else English. A build without language
 *      folders (a single-language build) is served as it is.
 *
 * Zero dependencies on purpose. It previews the production build locally, and
 * it is the static host inside the demo container (tools/start-demo.mjs) —
 * enough for a demo; a production deployment would give these rules to
 * its CDN or reverse proxy. See docs/PRODUCTION-READINESS.md.
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

/** The language folders the build produced, English first (the fallback). */
const LOCALES = ['en', 'nl'].filter((code) => existsSync(join(root, code, 'index.html')));
const localized = LOCALES.length > 0;

if (!localized && !existsSync(join(root, 'index.html'))) {
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
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** The visitor's language: the switcher's cookie, then the browser's preference. */
function preferredLocale(req) {
  const cookie = /(?:^|;\s*)lang=([a-z]{2})/.exec(req.headers.cookie ?? '')?.[1];
  if (cookie && LOCALES.includes(cookie)) {
    return cookie;
  }
  for (const part of (req.headers['accept-language'] ?? '').split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (LOCALES.includes(code)) {
      return code;
    }
  }
  return LOCALES[0];
}

function proxy(req, res, url) {
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
}

/** Angular hashes its bundles (`main-6L6GNWEQ.js`, `chunk-DunDG0z_.js`, `styles-….css`). */
const HASHED_BUNDLE = /-[A-Za-z0-9_-]{8}\.(js|css)$/;

/**
 * Hashed bundles are immutable. Media and assets keep their names (so the
 * fonts can be preloaded from index.html) and are cached for a day; index.html
 * must never be cached.
 */
function cacheControl(file) {
  if (file.endsWith('index.html')) {
    return 'no-cache';
  }
  return HASHED_BUNDLE.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
}

/** A file under `base`, or that folder's index.html (the SPA fallback). */
function serveFrom(base, pathname, res) {
  // Contain path traversal before touching the filesystem.
  const requested = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(base, requested);
  const file =
    candidate.startsWith(base) && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(base, 'index.html');

  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': cacheControl(file),
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    proxy(req, res, url);
    return;
  }
  if (!localized) {
    serveFrom(root, url.pathname, res);
    return;
  }

  const [, first = ''] = url.pathname.split('/');
  if (LOCALES.includes(first)) {
    serveFrom(join(root, first), url.pathname.slice(first.length + 1) || '/', res);
    return;
  }
  // Not in a language yet: into the visitor's, keeping the rest of the path.
  res.writeHead(302, {
    location: `/${preferredLocale(req)}${url.pathname}${url.search}`,
    vary: 'Cookie, Accept-Language',
    'cache-control': 'no-cache',
  });
  res.end();
});

server.listen(port, () => {
  const languages = localized ? `, languages ${LOCALES.join(' + ')}` : '';
  console.log(
    `[ preview ] http://localhost:${port}  (root ${root}${languages}, /api → ${apiTarget.origin})`,
  );
});
