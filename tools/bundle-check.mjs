#!/usr/bin/env node
/**
 * The bundle, diffed against the committed baseline.
 *
 *   npm run bundle:check      after `npm run build:web` — prints the table,
 *                             fails when a chunk grew past its tolerance
 *   npm run bundle:baseline   accepts the current sizes as the new baseline
 *                             (commit it, and say why the bundle grew)
 *
 * Sizes come from the production build's stats.json (an esbuild metafile).
 * "Initial" is what the browser must download before the app can start:
 * main, polyfills and every chunk they import statically — the same number
 * `ng build` prints as "Initial total". Named chunks are the lazy entry
 * points: routes, deferred blocks and on-demand imports.
 *
 * Tolerance: the initial bundle may grow by 5 kB or 3 %, a named chunk by
 * 5 kB or 10 % (whichever is larger). Below that, a change is noise;
 * above it, someone should have meant it.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const STATS = 'apps/web/dist/web/stats.json';
const OUTPUT_DIRS = ['apps/web/dist/web/browser/en', 'apps/web/dist/web/browser'];
const BASELINE = 'apps/web/bundle-baseline.json';

const update = process.argv.includes('--update');

if (!existsSync(STATS)) {
  console.error(`No ${STATS} — run \`npm run build:web\` first.`);
  process.exit(2);
}
const stats = JSON.parse(readFileSync(STATS, 'utf8'));
const outputs = Object.entries(stats.outputs).filter(
  ([file]) => file.endsWith('.js') || file.endsWith('.css'),
);

// ── Initial: the static import closure of the entry points ────────────────
// main, polyfills and the global stylesheet — what `ng build` counts too.
const byFile = new Map(outputs);
const isEntry = (output) =>
  output.entryPoint?.endsWith('main.ts') ||
  output.entryPoint?.startsWith('angular:polyfills') ||
  output.entryPoint?.startsWith('angular:styles/global');
const initial = new Set();
const visit = (file) => {
  if (initial.has(file) || !byFile.has(file)) {
    return;
  }
  initial.add(file);
  for (const imp of byFile.get(file).imports ?? []) {
    if (imp.kind === 'import-statement') {
      visit(imp.path);
    }
  }
};
for (const [file, output] of outputs) {
  if (isEntry(output)) {
    visit(file);
  }
}

// ── Named chunks: every lazy entry point, by the name Angular prints ───────
// A re-export stub under a kilobyte is not worth a row.
const chunkName = (entryPoint) => basename(entryPoint).replace(/\.(ts|mjs|js)$/, '');
const named = {};
for (const [file, output] of outputs) {
  if (
    output.entryPoint &&
    !initial.has(file) &&
    !output.entryPoint.startsWith('angular:') &&
    output.bytes >= 1024
  ) {
    named[chunkName(output.entryPoint)] = file;
  }
}

const gzipOf = (file) => {
  for (const dir of OUTPUT_DIRS) {
    const path = join(dir, file);
    if (existsSync(path)) {
      return gzipSync(readFileSync(path)).length;
    }
  }
  return null;
};
const sum = (files, measure) => {
  let total = 0;
  for (const file of files) {
    const size = measure(file);
    if (size === null) {
      return null;
    }
    total += size;
  }
  return total;
};

const current = {
  initial: {
    raw: sum(initial, (f) => byFile.get(f).bytes),
    gzip: sum(initial, gzipOf),
  },
  chunks: Object.fromEntries(
    Object.entries(named)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, file]) => [name, { raw: byFile.get(file).bytes, gzip: gzipOf(file) }]),
  ),
};

if (update) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`Baseline written to ${BASELINE}: initial ${kb(current.initial.raw)}.`);
  process.exit(0);
}

// ── The diff ──────────────────────────────────────────────────────────────
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
if (!baseline) {
  console.error(`No ${BASELINE} — run \`npm run bundle:baseline\` and commit it.`);
  process.exit(2);
}

const allowed = (base, pct) => Math.max(5 * 1024, base * pct);
const rows = [];
const breaches = [];
const row = (name, before, now, pct) => {
  const delta = before === undefined ? null : now.raw - before.raw;
  const over = delta !== null && delta > allowed(before.raw, pct);
  rows.push({ name, before, now, delta, over });
  if (over) {
    breaches.push(name);
  }
};
row('initial', baseline.initial, current.initial, 0.03);
const names = new Set([...Object.keys(baseline.chunks ?? {}), ...Object.keys(current.chunks)]);
for (const name of [...names].sort()) {
  const now = current.chunks[name];
  if (!now) {
    rows.push({ name, before: baseline.chunks[name], now: null, delta: null, over: false });
    continue;
  }
  row(name, baseline.chunks?.[name], now, 0.1);
}

// Angular's build table and its budgets count a kB as 1000 bytes; so does this.
function kb(bytes) {
  return bytes === null || bytes === undefined ? '—' : `${(bytes / 1000).toFixed(1)} kB`;
}
function signed(delta) {
  if (delta === null) {
    return 'new';
  }
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${(Math.abs(delta) / 1000).toFixed(1)} kB`;
}

const table = [
  '| Chunk | Baseline | Now | Δ raw | gzip |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...rows.map(
    ({ name, before, now, delta, over }) =>
      `| ${over ? `**${name}** ⚠` : name} | ${kb(before?.raw)} | ${now ? kb(now.raw) : 'gone'} | ${
        now ? signed(delta) : '—'
      } | ${kb(now?.gzip)} |`,
  ),
].join('\n');

const heading = breaches.length
  ? `### Bundle: ${breaches.join(', ')} grew past the tolerance`
  : '### Bundle: within the baseline';
console.log(`${heading}\n\n${table}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${heading}\n\n${table}\n\n`);
}
if (breaches.length) {
  console.error(
    `If the growth is intended, accept it with \`npm run bundle:baseline\` and say why in the commit.`,
  );
  process.exit(1);
}
