#!/usr/bin/env node
/**
 * ASYNC-UX.md guardrail: the design language is SKELETON-FIRST — progress
 * spinners must never be reintroduced for async feedback. Run via
 * `npm run check:no-spinners` (documented in docs/design/ASYNC-UX.md).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'apps', 'web', 'src');
const BANNED = [
  /MatProgressSpinner/,
  /mat-spinner/,
  /mat-progress-spinner/i,
  /progress-circular/i,
  /\bspinner\b/i,
];

const offenders = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    // Specs are exempt: they name spinners precisely to assert there are none.
    if (!/\.(ts|html|scss)$/.test(entry) || entry.endsWith('.spec.ts')) {
      continue;
    }
    const content = readFileSync(path, 'utf8');
    for (const pattern of BANNED) {
      const match = content.match(pattern);
      if (match) {
        offenders.push(`${path}: "${match[0]}"`);
      }
    }
  }
}

walk(ROOT);
if (offenders.length > 0) {
  console.error('✖ Spinner ban violated (skeleton-first design — see docs/design/ASYNC-UX.md):');
  for (const line of offenders) {
    console.error(`  ${line}`);
  }
  process.exit(1);
}
console.log('✓ No spinners in apps/web/src — skeleton-first holds.');
