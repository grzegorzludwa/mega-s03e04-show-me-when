// Records the deployed board in use (open-board, watch-board, ack-incident) and writes a timeline
// with mm:ss offsets and ack receipts to recordings/<name>.json. The cursor dot and captions are
// drawn by this recorder (addInitScript), not by the board.
// Usage: node scripts/record.mjs <board url> <name> [mode]   mode: shift (step 1) | default
import { chromium } from 'playwright';
import { mkdir, writeFile, rename } from 'node:fs/promises';

const [url, name, mode = 'shift'] = process.argv.slice(2);
const out = new URL('../recordings/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 }, locale: process.env.LOCALE || 'en-GB',
  timezoneId: process.env.TZ_ID || 'Europe/Warsaw', recordVideo: { dir: out, size: { width: 1280, height: 720 } },
});
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,0,80,.55);border:2px solid #c00;pointer-events:none;left:-50px;top:-50px;transition:transform .1s';
    const cap = document.createElement('div');
    cap.style.cssText = 'position:fixed;z-index:99998;left:0;right:0;bottom:0;padding:8px 16px;background:rgba(20,20,30,.88);color:#fff;font:15px/1.35 system-ui;pointer-events:none';
    cap.id = '__cap';
    document.body.append(dot, cap);
    addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => (dot.style.transform = 'scale(1.8)'), true);
    addEventListener('mouseup', () => (dot.style.transform = ''), true);
    const t0 = performance.now();
    setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); cap.dataset.clock = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; cap.firstChild && (cap.firstChild.textContent = `[recorder ${cap.dataset.clock}] `); }, 200);
  });
});

const t0 = Date.now();
const page = await ctx.newPage();
const at = () => { const s = Math.floor((Date.now() - t0) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const timeline = { url, mode, startedAt: new Date(t0).toISOString(), events: [], acks: [] };
const note = async (text, extra = {}) => {
  const ev = { at: at(), text, ...extra };
  timeline.events.push(ev);
  console.log(ev.at, text);
  await page.evaluate((t) => { const c = document.getElementById('__cap'); if (c) c.innerHTML = `<span></span>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}`; }, text).catch(() => {});
};
page.on('console', (m) => {
  const a = m.args();
  if (m.text().startsWith('ack ')) {
    const [, id, ackedAt, receipt] = m.text().split(' ');
    timeline.acks.push({ at: at(), id, ackedAt, receipt });
  }
});
const rowIds = () => page.locator('[data-testid="incident-row"]').evaluateAll((e) => e.map((x) => x.dataset.id));
const waitTopChange = async (from, ms = 30000) => page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== id, from, { timeout: ms, polling: 50 });

await page.goto(url);
await note('open-board: opening the deployed board');
await page.locator('[data-testid="incident-row"]').first().waitFor();
const sha = await page.locator('meta[name="build"]').getAttribute('content');
timeline.sha = sha;
await note(`open-board: incidents loaded, loader gone. Build ${sha.slice(0, 12)} (footer + meta)`);
await page.mouse.move(640, 300);
await page.waitForTimeout(2500);
await page.locator('[data-testid="build-sha"]').scrollIntoViewIfNeeded();
await page.locator('[data-testid="build-sha"]').hover();
await note(`open-board: footer names build ${sha}`);
await page.waitForTimeout(2500);
await page.evaluate(() => scrollTo(0, 0));

let top = (await rowIds())[0];
await note(`watch-board: board left open, no reload. Top row is ${top}. Waiting for a new incident...`);
await waitTopChange(top);
let ids = await rowIds();
await note(`watch-board: ${ids[0]} arrived at the top without a reload (${ids.length} rows)`);
await page.waitForTimeout(2000);

if (mode === 'shift') {
  // Aim at the Ack of the 3rd row, the way a person does: point, read, click where the button was.
  ids = await rowIds();
  const target = ids[2];
  const btn = page.locator(`[data-testid="incident-row"][data-id="${target}"] [data-testid="ack"]`);
  const box = await btn.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 15 });
  await note(`ack-incident: pointing at Ack of ${target} (row 3). Waiting for the next incident to arrive...`, { aimedAt: target });
  await waitTopChange(ids[0], 30000);
  await page.waitForTimeout(120); // human reaction: the click was already on its way
  const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="incident-row"]')?.dataset.id, [x, y]);
  await page.mouse.click(x, y);
  await page.locator(`[data-testid="incident-row"][data-id="${under}"] [data-testid="acked"]`).waitFor();
  await note(`ack-incident: a new incident pushed the rows down just before the click. Aimed at ${target}, acked ${under}.`, { aimedAt: target, acked: under });
  await page.waitForTimeout(3500);
  await page.locator(`[data-testid="incident-row"][data-id="${under}"]`).hover();
  await note(`ack-incident: ${under} shows ✓ Acked; ${target} is still un-acked`);
  await page.waitForTimeout(3500);
} else {
  ids = await rowIds();
  const target = ids[2];
  await page.locator(`[data-testid="incident-row"][data-id="${target}"] [data-testid="ack"]`).click();
  await page.locator(`[data-testid="incident-row"][data-id="${target}"] [data-testid="acked"]`).waitFor();
  await note(`ack-incident: acked ${target}`, { aimedAt: target, acked: target });
  await page.waitForTimeout(3000);
}
await note('end of recording');
await page.waitForTimeout(1500);
const video = page.video();
await ctx.close();
await browser.close();
await rename(await video.path(), `${out}${name}.webm`);
timeline.video = `${name}.webm`;
await writeFile(`${out}${name}.json`, JSON.stringify(timeline, null, 2));
console.log('saved', `${out}${name}.webm`);
