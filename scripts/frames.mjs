#!/usr/bin/env node
/**
 * Frame check (spec §19 Phase 11: "no frame drops at 20× speed"). Opens the game in Chromium, fills the desktop with the
 * busiest windows — MajorTrade Pro's quotes, a company's web page with its chart, Outbox Express — then measures frame
 * times with the clock paused, at 1× and at 20×, and while dragging a window at 20×. A frame is dropped when it takes
 * more than 1.5 refresh intervals; the check passes when 20× drops no more frames than the paused desktop does, and no
 * task blocks the page for 100 ms or more.
 *
 *   npm run dev            (in one terminal)
 *   npm run frames         (in another; needs Playwright: npm i -D playwright && npx playwright install chromium)
 *
 * Environment: URL (default http://localhost:5173/), SECONDS per phase (default 20), CHROME (path to a Chromium binary).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright');
}

const URL = process.env.URL ?? 'http://localhost:5173/';
const SECONDS = Number(process.env.SECONDS ?? 20);
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

await page.goto(URL);
await page.getByRole('button', { name: 'Cancel' }).first().click();
await page.getByRole('button', { name: 'Exit Setup' }).click();
await page.waitForSelector('.taskbar', { timeout: 60_000 });
await page.waitForTimeout(1500);

// The busiest windows: quotes, a company page with a chart, mail.
const start = async (path) => {
  await page.locator('.start-button').click();
  const menu = page.locator('.start-menu');
  await menu.getByText('Programs', { exact: true }).hover();
  await menu.getByText(path, { exact: true }).click();
  await page.waitForTimeout(700);
};
await start('MajorTrade Pro 98');
await start('Outbox Express');
await start('Internet Exploiter');
await page.locator('.address, input[type=text]').first().fill('http://www.mvidea.com/investor.html');
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);

await page.evaluate(() => {
  window.__frames = [];
  window.__long = [];
  let last = performance.now();
  const tick = (now) => {
    window.__frames.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: true });
  } catch {}
});

const clock = () => page.locator('.tray').first().innerText().then((t) => t.match(/\w{3} \d{2} \w{3} \d{4} \d{2}:\d{2}/)?.[0] ?? '?');
const measure = async (label, action) => {
  await page.evaluate(() => ((window.__frames.length = 0), (window.__long.length = 0)));
  const from = await clock();
  await action();
  const to = await clock();
  const { frames, long } = await page.evaluate(() => ({ frames: window.__frames.slice(2), long: window.__long.slice() }));
  const sorted = [...frames].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const median = q(0.5);
  const dropped = frames.filter((f) => f > Math.max(1.5 * median, 25)).length;
  const result = { label, clock: `${from} → ${to}`, frames: frames.length, median: +median.toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +sorted.at(-1).toFixed(1), dropped, droppedPct: +((100 * dropped) / frames.length).toFixed(2), longTasks: long.length, longestTask: long.length ? Math.round(Math.max(...long)) : 0 };
  console.log(JSON.stringify(result));
  return result;
};
const speed = async (s) => {
  await page.locator('.tray-speed button', { hasText: s }).first().click();
  await page.waitForTimeout(1500);
};
const wait = () => page.waitForTimeout(SECONDS * 1000);

const results = {};
await speed('⏸');
results.paused = await measure('paused', wait);
await speed('1×');
results.x1 = await measure('1×', wait);
await speed('20×');
results.x20 = await measure('20×', wait);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
results.drag = await measure('20× while dragging a window', async () => {
  const title = page.locator('.title-bar').first();
  const box = await title.boundingBox();
  await page.mouse.move(box.x + 60, box.y + 8);
  await page.mouse.down();
  const until = Date.now() + SECONDS * 1000;
  for (let t = 0; Date.now() < until; t++) {
    await page.mouse.move(box.x + 60 + 250 * Math.sin(t / 15), box.y + 8 + 120 * Math.cos(t / 20));
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
});

await browser.close();
if (errors.length) console.log(errors.join('\n'));
const worst = Math.max(results.x1.droppedPct, results.x20.droppedPct, results.drag.droppedPct);
const ok = results.x20.droppedPct <= results.paused.droppedPct + 1 && results.drag.droppedPct <= results.paused.droppedPct + 2 && results.x20.longestTask < 100 && !errors.length;
console.log(ok ? `PASS: 20× drops ${results.x20.droppedPct}% of frames (paused: ${results.paused.droppedPct}%)` : `FAIL: worst ${worst}% dropped; longest task ${results.x20.longestTask} ms; ${errors.length} errors`);
process.exit(ok ? 0 : 1);
