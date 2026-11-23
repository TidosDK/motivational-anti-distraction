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
    assert.equal(await page.locator('.report-window').count(), 0, 'empty reports omit the date range');
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
    const dateRange = (offset) => page.evaluate(([first, last]) => new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).formatRange(new Date(`${first}T00:00:00Z`), new Date(`${last}T00:00:00Z`)), [keyAt(offset), keyAt(0)]);

    const settings = {
      version: 1, resetHour, passSessionMin: 10, combinedBudgetMin: 55,
      sites: [{ domain: 'example.com', limitMin: 30, passes: 2 }, { domain: 'news.example.org', limitMin: null, passes: 2 }],
    };
    const stale = { version: 1, dayStart: dayAt(1).getTime(), perSiteSeconds: {}, passesUntil: {}, passesUsed: {} };
    const meta = { installTs: dayAt(500).getTime(), estimated: true };
    const minutesByOffset = new Map([[1, 15], [2, 30], [3, 40], [5, 45], [6, 60], [8, 61]]);
    const multiSiteDays = new Map([
      [3, { 'news.example.org': 8 * 60, 'example.com': 32 * 60, 'unused.example.net': 0 }],
      [8, { 'example.com': 30 * 60, 'news.example.org': 31 * 60 }],
    ]);
    const history = {};
    for (let offset = 400; offset >= 1; offset--) {
      if (offset === 4) continue;
      const sec = (minutesByOffset.get(offset) ?? 0) * 60;
      const overrides = Array.from({ length: offset === 5 ? 2 : offset === 8 ? 1 : 0 }, () =>
        ({ site: 'example.com', ts: dayAt(offset).getTime(), affirmed: true }),
      );
      const perSite = multiSiteDays.get(offset) ?? { 'example.com': sec };
      history[keyAt(offset)] = { perSite, totalSec: sec, overrides };
    }
    await page.evaluate((data) => chrome.storage.local.set(data), { settings, state: stale, history, meta });
    await waitUntil(() => page.evaluate(async () => Object.keys((await chrome.storage.local.get('history')).history).length === 370),
      'a real day roll prunes to 370 records');
    const saved = await page.evaluate(() => chrome.storage.local.get(['history', 'state', 'meta']));
    assert.equal(Object.keys(saved.history).sort()[0], keyAt(371));
    assert.deepEqual(saved.meta, meta, 'day roll preserves the install metadata');

    const windowLabel = page.locator('.report-window');
    const retainedDates = await dateRange(371);
    await waitUntil(async () => (await windowLabel.textContent()) === retainedDates,
      'the report includes the missing day and the current day in the retained range');
    const metric = (name) => page.locator('.history-metric').filter({ has: page.getByRole('heading', { name, exact: true }) });
    assert.deepEqual(await metric('Total Recorded').locator('p').allTextContents(), ['4h 11m tracked · 3 overrides', retainedDates]);
    assert.deepEqual(await metric('Under-budget Streaks').locator('p').allTextContents(), ['Current 3 · Best 363 days']);
    const installAge = page.locator('#stats > footer:last-child .report-install');
    assert.equal(await installAge.textContent(), '500 usage days since install (estimated from retained history)');
    assert.equal(await page.locator('.heatmap-grid').count(), 0, 'calendar mode is off by default');
    assert.equal(await page.locator('.week-legend').count(), 0, 'the weekly chart legend is removed');
    assert.equal(await page.locator('.week-day').count(), 7);
    assert.equal(await page.locator('.week-average-label').textContent(), 'Daily average');
    const average = page.locator('.week-average-value');
    assert.equal(await average.textContent(), '27m');
    const sizes = await average.evaluate((el) => {
      const label = getComputedStyle(document.querySelector('.week-average-label'));
      return {
        value: parseFloat(getComputedStyle(el).fontSize),
        label: parseFloat(label.fontSize),
        heading: parseFloat(getComputedStyle(document.querySelector('.history-reports h2')).fontSize),
        range: parseFloat(getComputedStyle(document.querySelector('.week-range')).fontSize),
        labelColor: label.color,
        mutedColor: getComputedStyle(document.querySelector('.week-budget')).color,
      };
    });
    assert.ok(sizes.value >= 30 && sizes.value <= 42, 'the average time uses the reduced scale');
    assert.ok(sizes.label < sizes.heading, 'the average label is smaller than the section heading');
    assert.ok(sizes.range > sizes.label, 'the week date range is larger than the chart labels');
    assert.equal(sizes.labelColor, sizes.mutedColor);
    const nextWeek = page.getByRole('button', { name: 'Next week' });
    const previousWeek = page.getByRole('button', { name: 'Previous week' });
    assert.ok(await nextWeek.isDisabled());
    const day = (offset) => page.locator(`.week-day[data-day="${keyAt(offset)}"]`);
    const barStatus = (offset) => day(offset).locator('.week-bar-fill').getAttribute('data-budget');
    const rowStatus = (offset) => page.locator('.history-row')
      .filter({ has: page.getByText(keyAt(offset), { exact: true }) }).locator('.budget-status');
    assert.match(await day(4).getAttribute('aria-label'), /0m · Within combined budget$/);
    assert.match(await day(1).getAttribute('aria-label'), /15m · Within combined budget$/);
    assert.match(await day(3).getAttribute('aria-label'), /40m · Within combined budget$/);
    assert.equal(await barStatus(3), 'within', 'site-only overages keep the bar green');
    assert.equal(await barStatus(6), 'over', 'combined overages give the bar its red style');
    assert.equal(await rowStatus(1).textContent(), 'Within combined budget');
    assert.equal(await rowStatus(3).textContent(), 'Site limit exceeded');
    assert.equal(await rowStatus(3).getAttribute('data-budget'), 'site');
    assert.equal(await rowStatus(3).getAttribute('title'), 'Exceeded example.com');
    assert.equal(await rowStatus(8).textContent(), 'Over combined budget');
    assert.equal(await rowStatus(8).getAttribute('data-budget'), 'over');
    assert.equal(await rowStatus(8).getAttribute('title'), null, 'a combined-only overage names no sites');

    const siteUsage = page.getByRole('region', { name: 'Website usage' });
    assert.equal(await page.locator('.history-summary + .day-sites').count(), 1, 'the breakdown sits below both summaries');
    const siteRows = () => siteUsage.getByRole('listitem').evaluateAll((rows) => rows.map((row) => [
      row.querySelector('.day-site-name').textContent,
      row.querySelector('.day-site-time').textContent,
      row.querySelector('.day-site-share').textContent,
      row.querySelector('.meter-fill').style.width,
    ]));
    const summaryTop = () => page.locator('.history-summary').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await day(4).click();
    assert.deepEqual(await siteRows(), [], 'an unrecorded day has no website rows');
    assert.ok(await siteUsage.getByText('No website usage recorded for this day.').isVisible());
    const quietSummaryTop = await summaryTop();
    await day(1).click();
    assert.equal(await summaryTop(), quietSummaryTop, 'adding a website row leaves the summaries in place');
    assert.deepEqual(await siteRows(), [['example.com', '15m', '100%', '100%']]);

    await day(3).click();
    assert.equal(await day(3).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.week-detail strong').textContent(), '40m');
    assert.equal(await page.locator('.week-detail .budget-status').getAttribute('data-budget'), 'site');
    assert.equal(await page.locator('.week-overages').textContent(), 'Exceeded example.com');
    assert.deepEqual(await siteRows(), [
      ['example.com', '32m', '80%', '80%'], ['news.example.org', '8m', '20%', '20%'],
    ], 'sites are ordered by time and zero-usage sites are omitted');
    if (inspect) await inspect(page);

    await previousWeek.click();
    assert.match(await day(8).getAttribute('aria-label'), /1h 1m · Over combined budget$/);
    assert.equal(await barStatus(8), 'over');
    await day(8).press('Enter');
    const earlierSites = [['news.example.org', '31m', '51%', '51%'], ['example.com', '30m', '49%', '49%']];
    assert.deepEqual(await siteRows(), earlierSites, 'keyboard selection updates the breakdown in older weeks');
    assert.ok(await nextWeek.isEnabled());
    const previousRange = await page.locator('.week-range').textContent();
    const edited = { ...settings, combinedBudgetMin: 90, sites: [{ ...settings.sites[0], limitMin: 90 }, settings.sites[1]] };
    await page.evaluate((settings) => chrome.storage.local.set({ settings }), edited);
    await waitUntil(async () => (await page.locator('.report-streak').textContent()) === 'Current 372 · Best 372 days',
      'editing budgets re-scores streaks without a reload');
    assert.equal(await page.locator('.report-totals').textContent(), '4h 11m tracked · 3 overrides');
    assert.equal(await page.locator('.week-range').textContent(), previousRange, 'updates preserve the displayed week');
    assert.match(await day(8).getAttribute('aria-label'), /1h 1m · Within combined budget$/);
    assert.equal(await barStatus(8), 'within');
    assert.equal(await rowStatus(3).textContent(), 'Within combined budget');
    assert.equal(await day(8).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await siteRows(), earlierSites, 'live updates preserve the selected day and its breakdown');
    assert.deepEqual(await page.evaluate(() => chrome.storage.local.get(['history', 'state', 'meta'])), saved,
      're-scoring leaves usage, passes, history, and install metadata intact');
    await nextWeek.click();
    assert.ok(await nextWeek.isDisabled());
    assert.match(await day(3).getAttribute('aria-label'), /40m · Within combined budget$/);

    const last370Days = Object.fromEntries(Object.entries(saved.history).filter(([key]) => key >= keyAt(369)));
    await page.evaluate((history) => chrome.storage.local.set({ history }), last370Days);
    const prunedDates = await dateRange(369);
    await waitUntil(async () => (await windowLabel.textContent()) === prunedDates,
      'the report handles an exact 370-day calendar span');
    assert.match(await installAge.textContent(), /^500 usage days since install/);

    await page.evaluate((data) => chrome.storage.local.set(data), {
      history: { [keyAt(0)]: { perSite: { 'example.com': 60 }, totalSec: 60, overrides: [] } },
      state: { ...saved.state, perSiteSeconds: { 'example.com': 132.98 * 60 - 70, 'brief.example.net': 10 } },
    });
    const singleDate = await dateRange(0);
    await waitUntil(async () => (await windowLabel.textContent()) === singleDate, 'a one-day report shows a single date');
    assert.equal(await page.locator('.week-detail strong').textContent(), '2h 13m');
    assert.match(await day(0).getAttribute('aria-label'), /2h 13m · Over combined budget$/);
    assert.deepEqual(await siteRows(), [
      ['example.com', '2h 13m', '100%', '100%'], ['brief.example.net', '<1m', '<1%', '0%'],
    ], 'today combines stored and active time and includes visits under a minute');
    console.log('verify-reports: passed retention, weekly navigation, website breakdown, budget labels, totals, and live re-scoring');
  } finally {
    await ctx.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyReports();
