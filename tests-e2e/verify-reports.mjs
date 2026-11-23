import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchBrave, sleep } from './helpers.mjs';

async function waitUntil(check, message) {
  const deadline = Date.now() + 10_000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, message);
    await sleep(50);
  }
}

export async function verifyReports(launch = launchBrave, inspect) {
  const beforeLaunch = Date.now();
  const { ctx, id } = await launch();
  try {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/stats.html`);
    await page.getByText('No usage days recorded yet.').waitFor();
    await waitUntil(() => page.evaluate(async () => (await chrome.storage.local.get('meta')).meta?.installTs),
      'the worker records an install date');
    const freshMeta = await page.evaluate(async () => (await chrome.storage.local.get('meta')).meta);
    assert.ok(freshMeta.installTs >= beforeLaunch && freshMeta.installTs <= Date.now());

    const now = new Date();
    const resetHour = (now.getHours() + 12) % 24;
    const today = new Date(now);
    today.setHours(resetHour, 0, 0, 0);
    if (now < today) today.setDate(today.getDate() - 1);
    const dayAt = (offset) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset, resetHour);
    const keyAt = (offset) => {
      const day = dayAt(offset);
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    };

    const settings = {
      version: 1, resetHour, passSessionMin: 10, combinedBudgetMin: 60,
      sites: [{ domain: 'example.com', limitMin: 30, passes: 2 }],
    };
    const stale = { version: 1, dayStart: dayAt(1).getTime(), perSiteSeconds: {}, passesUntil: {}, passesUsed: {} };
    const meta = { installTs: dayAt(500).getTime(), estimated: true };
    const minutesByOffset = new Map([[1, 15], [2, 30], [3, 40], [5, 45], [6, 60], [8, 61]]);
    const history = {};
    for (let offset = 400; offset >= 1; offset--) {
      if (offset === 4) continue;
      const sec = (minutesByOffset.get(offset) ?? 0) * 60;
      const overrides = Array.from({ length: offset === 5 ? 2 : offset === 8 ? 1 : 0 }, () =>
        ({ site: 'example.com', ts: dayAt(offset).getTime(), affirmed: true }),
      );
      history[keyAt(offset)] = { perSite: { 'example.com': sec }, totalSec: sec, overrides };
    }
    await page.evaluate((data) => chrome.storage.local.set(data), { settings, state: stale, history, meta });
    await waitUntil(() => page.evaluate(async () => Object.keys((await chrome.storage.local.get('history')).history).length === 370),
      'a real day roll prunes to 370 records');
    const saved = await page.evaluate(() => chrome.storage.local.get(['history', 'state', 'meta']));
    assert.equal(Object.keys(saved.history).sort()[0], keyAt(371));
    assert.deepEqual(saved.meta, meta, 'day roll preserves the install metadata');

    await waitUntil(async () => (await page.locator('.report-window').textContent())?.includes('372 usage days'),
      'the report includes the missing day and the current day in the retained range');
    assert.equal(await page.locator('.heatmap-grid [data-day]').count(), 372);
    assert.equal(await page.locator('.report-window').textContent(), `${keyAt(371)} – ${keyAt(0)} · 372 usage days`);
    assert.equal(await page.locator('.report-totals').textContent(), '4h 11m tracked · 3 overrides');
    assert.equal(await page.locator('.report-install').textContent(), '500 usage days since install (estimated from retained history)');
    assert.equal(await page.locator('.report-streak').textContent(), 'Current 3 · Best 363 days');
    const scroll = page.locator('.heatmap-scroll');
    assert.ok(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth && el.scrollLeft > 0), 'the full calendar opens at the latest days');

    for (const [offset, minutes, bucket] of [[4, 0, 0], [1, 15, 1], [2, 30, 2], [5, 45, 3], [6, 60, 4], [8, 61, 5]]) {
      const cell = page.locator(`[data-day="${keyAt(offset)}"]`);
      assert.equal(await cell.getAttribute('data-bucket'), String(bucket));
      const title = await cell.getAttribute('title');
      assert.ok(title.endsWith(`· ${minutes} min`));
      assert.equal(await cell.getAttribute('aria-label'), title);
    }
    await page.locator(`[data-day="${keyAt(1)}"]`).hover();
    if (inspect) await inspect(page);

    await scroll.evaluate((el) => { el.scrollLeft = 0; });
    const edited = { ...settings, combinedBudgetMin: 90, sites: [{ ...settings.sites[0], limitMin: 90 }] };
    await page.evaluate((settings) => chrome.storage.local.set({ settings }), edited);
    await waitUntil(async () => (await page.locator('.report-streak').textContent()) === 'Current 372 · Best 372 days',
      'editing budgets re-scores streaks without a reload');
    assert.equal(await page.locator('.report-totals').textContent(), '4h 11m tracked · 3 overrides');
    assert.equal(await scroll.evaluate((el) => el.scrollLeft), 0, 'updates preserve the scrolled position');
    assert.deepEqual(await page.evaluate(() => chrome.storage.local.get(['history', 'state', 'meta'])), saved,
      're-scoring leaves usage, passes, history, and install metadata intact');

    const last370Days = Object.fromEntries(Object.entries(saved.history).filter(([key]) => key >= keyAt(369)));
    await page.evaluate((history) => chrome.storage.local.set({ history }), last370Days);
    await waitUntil(async () => (await page.locator('.heatmap-grid [data-day]').count()) === 370,
      'the report handles an exact 370-day calendar span');
    assert.match(await page.locator('.report-window').textContent(), /· 370 usage days$/);
    assert.match(await page.locator('.report-install').textContent(), /^500 usage days since install/);
    console.log('verify-reports: passed metadata, retention, calendar cells, totals, and live streak re-scoring');
  } finally {
    await ctx.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyReports();
