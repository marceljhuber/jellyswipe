// Takes the README/marketing screenshots from a running demo server (dev/demo-server.sh).
//   node dev/screenshots.mjs [url] [outdir] [light|dark]
// Defaults: http://localhost:28296, docs/screenshots, dark. Uses a neutral "jellyfin.home" hostname
// (mapped to 127.0.0.1 inside the browser) so no localhost warning or real address shows up, also not in the QR code.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = new URL(process.argv[2] || 'http://localhost:28296');
const out = path.resolve(process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname), '../docs/screenshots'));
const scheme = process.argv[4] || 'dark';
const J = `http://jellyfin.home:${base.port || 80}`;
const exe = process.env.CHROME || fs.globSync(`${process.env.HOME}/.cache/ms-playwright/chromium-*/chrome-linux*/chrome`).sort().at(-1);
fs.mkdirSync(out, { recursive: true });

const b = await chromium.launch({ executablePath: exe, args: [`--host-resolver-rules=MAP jellyfin.home ${base.hostname}`] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: scheme };
const errors = [];
const page = async () => { const p = await (await b.newContext(phone)).newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };
const shot = (p, name) => p.screenshot({ path: path.join(out, `${name}.png`) });

const h = await page();
await h.goto(`${J}/JellySwipe/`);
await h.waitForSelector('#create');
await h.fill('#name', 'Alex');
await h.waitForTimeout(400);
await shot(h, 'home');
await h.click('#create');
await h.waitForSelector('.tile');
await h.waitForSelector('#genres .chip');
await h.locator('#genres .chip', { hasText: /^Animation$/ }).click().catch(() => {});
await h.click('#goal button[data-g="1"]');
await h.locator('#deck-size').scrollIntoViewIfNeeded();
await h.waitForTimeout(400);
await shot(h, 'create');
await h.click('#go');
await h.waitForSelector('.lobby-code');
const code = (await h.textContent('.digits')).trim();

const g = await page();
await g.goto(`${J}/JellySwipe/?join=${code}`);
await g.fill('#name', 'Sam');
await g.fill('#code', code);
await g.waitForSelector('.lobby-code');
await h.waitForSelector('text=Start with 2 players');
await h.waitForTimeout(500);
await shot(h, 'lobby-2');

await h.click('#start');
await h.waitForSelector('#deck .card');
await g.waitForSelector('#deck .card');
await h.waitForTimeout(1500);
await shot(h, 'card');
for (let i = 0; i < 40 && !(await h.locator('.match-overlay').count()); i++) {
  if (await h.locator('#deck .card').count()) await h.keyboard.press('ArrowRight');
  if (await g.locator('#deck .card').count()) await g.keyboard.press('ArrowRight');
  await h.waitForTimeout(450);
}
await h.waitForSelector('.match-overlay');
await h.waitForTimeout(1300);
await shot(h, 'match');
await h.click('#keep');
await h.waitForSelector('.results-hero');
await h.waitForTimeout(3500);
await shot(h, 'results');
await b.close();
console.log(`screenshots (${scheme}) → ${out}`, errors.length ? `\npage errors: ${errors.join('; ')}` : '');
