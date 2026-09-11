/**
 * Runs axe on every story of the built Storybook and fails on any violation —
 * the a11y add-on shows the same checks in the Storybook UI; this makes them
 * a gate.
 *
 *   npm run build-storybook && npm run storybook:a11y
 *
 * Reads apps/web/dist/storybook/index.json, opens each story's iframe in
 * Chromium, waits for it to render, and checks it against WCAG 2.2 AA.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const root = resolve(process.argv[2] ?? 'apps/web/dist/storybook');
if (!existsSync(join(root, 'index.json'))) {
  console.error(`No built Storybook at ${root} — run \`npm run build-storybook\` first.`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// A plain static server: the built Storybook, nothing else.
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const file = join(root, normalize(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, ok));
const base = `http://localhost:${server.address().port}`;

const stories = Object.values(
  JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')).entries,
).filter((entry) => entry.type === 'story');

const browser = await chromium.launch();
// axe-core/playwright needs a page from an explicit context.
const page = await (await browser.newContext()).newPage();
let failures = 0;

for (const story of stories) {
  await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story`);
  // Attached, not visible: a toast host has no box of its own (its toasts are fixed).
  await page.locator('#storybook-root > *').first().waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForTimeout(300); // entrance animations settle
  const { violations } = await new AxeBuilder({ page })
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  if (violations.length === 0) {
    console.log(`  ok   ${story.title} › ${story.name}`);
    continue;
  }
  failures++;
  console.log(`  FAIL ${story.title} › ${story.name}`);
  for (const v of violations) {
    console.log(
      `       ${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
  }
}

await browser.close();
server.close();
console.log(`\n${stories.length - failures}/${stories.length} stories pass axe (WCAG 2.2 AA).`);
process.exitCode = failures ? 1 : 0;
