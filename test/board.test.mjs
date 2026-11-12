// Offline browser tests for the four issues. The incident API is mocked with page.route.
// Run: node test/board.test.mjs   (needs dist/ from scripts/build.sh; CHROME=<path> to pick a browser)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHA = (await readFile(join(DIST, 'index.html'), 'utf8')).match(/name="build" content="([^"]+)"/)[1];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    const body = await readFile(join(DIST, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': types[extname(path || '.html')] ?? 'text/html' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

const inc = (id, minutesAgo, extra = {}) => ({
  id, service: 'booking-api', region: 'eu-west', summary: `<b>${id}</b>`, severity: 'sev2',
  openedAt: new Date(Date.UTC(2026, 10, 12, 3, 3) - minutesAgo * 60000).toISOString(), ...extra,
});

async function board({ pages, locale = 'en-GB', timezoneId = 'Europe/Berlin', delayFirst = 0, ackStatus = 200 }) {
  const ctx = await browser.newContext({ locale, timezoneId });
  const page = await ctx.newPage();
  const calls = { incidents: [], acks: [] };
  await page.route('**/challenges/show-me-when/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/incidents')) {
      const n = calls.incidents.push(url.searchParams.get('since'));
      if (n === 1 && delayFirst) await new Promise((r) => setTimeout(r, delayFirst));
      const list = pages[Math.min(n - 1, pages.length - 1)];
      return route.fulfill({ json: { updatedAt: new Date().toISOString(), incidents: list, cursor: `c${n}` } });
    }
    const id = url.searchParams.get('id');
    calls.acks.push({ id, cursor: url.searchParams.get('cursor') });
    if (ackStatus !== 200) return route.fulfill({ status: ackStatus, body: 'nope' });
    return route.fulfill({ json: { id, ackedAt: new Date().toISOString(), receipt: `r-${id}` } });
  });
  await page.goto(base);
  return { ctx, page, calls };
}
const ids = (page) => page.locator('[data-testid="incident-row"]').evaluateAll((els) => els.map((e) => e.dataset.id));

const tests = {
  async 'SCHED-4512 loader shows until incidents load, then goes'() {
    const { ctx, page } = await board({ pages: [[inc('INC-1', 5)]], delayFirst: 800 });
    await page.locator('[data-testid="loader"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="incident-row"]').first().waitFor();
    assert.equal(await page.locator('[data-testid="loader"]').count(), 0);
    await ctx.close();
  },
  async 'empty state when there are no incidents'() {
    const { ctx, page } = await board({ pages: [[]] });
    await page.locator('[data-testid="empty"]').waitFor({ state: 'visible' });
    await ctx.close();
  },
  async 'SCHED-4511/4513 new incident appears at top without reload, refresh every ~2s'() {
    const a = inc('INC-A', 10), b = inc('INC-B', 5), c = inc('INC-C', 1);
    const { ctx, page, calls } = await board({ pages: [[a, b], [b, a], [c, b, a]] }); // unsorted page 1 on purpose
    await page.locator('[data-testid="incident-row"]').first().waitFor();
    assert.deepEqual(await ids(page), ['INC-B', 'INC-A']);
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelector('[data-testid="incident-row"]').dataset.id === 'INC-C', null, { timeout: 7000 });
    assert.ok(Date.now() - t0 > 2500, 'two refreshes take at least ~4s');
    assert.deepEqual(await ids(page), ['INC-C', 'INC-B', 'INC-A']);
    assert.equal(calls.incidents[1], 'c1', 'second fetch sends the cursor');
    assert.equal(await page.locator('.what').first().textContent(), 'booking-api · eu-west · <b>INC-C</b>', 'summary is text, not HTML');
    await ctx.close();
  },
  async 'SCHED-4511 Ack acks that row and marks it, survives refresh'() {
    const a = inc('INC-A', 10), b = inc('INC-B', 5), c = inc('INC-C', 1);
    const { ctx, page, calls } = await board({ pages: [[b, a], [c, b, a]] });
    await page.locator('[data-testid="incident-row"][data-id="INC-A"] [data-testid="ack"]').click();
    await page.locator('[data-testid="incident-row"][data-id="INC-A"] [data-testid="acked"]').waitFor();
    assert.deepEqual(calls.acks.map((x) => x.id), ['INC-A']);
    assert.ok(calls.acks[0].cursor, 'ack sends a cursor');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="incident-row"]').length === 3);
    assert.equal(await page.locator('[data-testid="acked"]').count(), 1);
    assert.equal(await page.locator('[data-testid="incident-row"][data-id="INC-B"] [data-testid="ack"]').count(), 1);
    await ctx.close();
  },
  async 'failed ack keeps the button and says which incident failed'() {
    const { ctx, page } = await board({ pages: [[inc('INC-A', 1)]], ackStatus: 400 });
    await page.locator('[data-testid="ack"]').click();
    await page.locator('[data-role="error"]').getByText('Ack failed for INC-A').waitFor();
    assert.equal(await page.locator('[data-testid="acked"]').count(), 0);
    assert.equal(await page.locator('[data-testid="ack"]').isEnabled(), true);
    await ctx.close();
  },
  async 'SCHED-4514 Auckland and Berlin each see their own zone and order'() {
    const one = [inc('INC-T', 0)]; // 2026-11-12T03:03:00Z
    for (const [locale, timezoneId, want] of [['en-NZ', 'Pacific/Auckland', /^12\/11 0?4:03\s?pm NZDT$/i], ['de-DE', 'Europe/Berlin', /^12\/11 04:03 MEZ$/], ['en-US', 'America/New_York', /^11\/11 10:03\sPM EST$/]]) {
      const { ctx, page } = await board({ pages: [one], locale, timezoneId });
      const t = page.locator('[data-testid="incident-row"] time');
      await t.waitFor();
      assert.match((await t.textContent()).trim(), want, `${locale} ${timezoneId}`);
      assert.equal(await t.getAttribute('datetime'), '2026-11-12T03:03:00.000Z');
      await ctx.close();
    }
  },
  async 'R6 build sha in meta and footer'() {
    const { ctx, page } = await board({ pages: [[]] });
    assert.equal(await page.locator('meta[name="build"]').getAttribute('content'), SHA);
    assert.equal(await page.locator('[data-testid="build-sha"]').textContent(), SHA);
    await ctx.close();
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
