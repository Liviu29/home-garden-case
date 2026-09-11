#!/usr/bin/env node
/**
 * Fails fast, with an actionable message, when this Node version is outside
 * the workspace's `engines` range. Without it, an old Node gets as far as the
 * Angular CLI and stops there with a less helpful error. Runs before `dev`,
 * `build` and `test` (npm pre-scripts); `npm ci` is already guarded by
 * `engine-strict` in .npmrc.
 *
 *   node tools/check-node.mjs
 */
import { readFileSync } from 'node:fs';

const { engines } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const range = engines.node; // e.g. "^22.22.3 || ^24.15.0"
const [major, minor, patch] = process.versions.node.split('.').map(Number);

const floors = range
  .split('||')
  .map((part) => /\^(\d+)\.(\d+)\.(\d+)/.exec(part.trim()))
  .filter(Boolean)
  .map((m) => m.slice(1).map(Number));

const supported = floors.some(
  ([M, m, p]) => major === M && (minor > m || (minor === m && patch >= p)),
);

if (!supported) {
  const wanted = floors.map(([M, m, p]) => `${M}.${m}.${p}+`).join(' or ');
  console.error(
    `\n✗ HomeGarden needs Node ${wanted}; this is ${process.version}.\n` +
      `  Run \`nvm use\` (the version is pinned in .nvmrc) or install the current Node 24 LTS.\n`,
  );
  process.exit(1);
}
