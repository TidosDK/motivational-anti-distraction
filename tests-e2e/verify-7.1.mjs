// Task 7.1 verification: the stats page renders seeded fixtures — today's
// per-site and combined usage vs limits, active-pass badge, overrides with
// timestamps, and the closed-day history.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, id } = await launchBrave();

function dayStartAt(base) {
  const d = new Date(base);
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  d.setHours(5, 0, 0, 0);
  return d.getTime();
}
function keyAt(base) {
  const d = new Date(dayStartAt(base));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const now = Date.now();
const todayKey = keyAt(now);
const yesterdayKey = keyAt(now - 26 * 3600 * 1000);
const twoDaysAgoKey = keyAt(now - 50 * 3600 * 1000);

await seed({
  settings: {
    version: 1,
    sites: [
      { domain: 'youtube.com', limitMin: 60, passes: 1 },
      { domain: 'instagram.com', limitMin: 30, passes: 2 },
    ],
    combinedBudgetMin: 120,
    resetHour: 5,
  },
  state: {
    version: 1,
    dayStart: dayStartAt(now),
    perSiteSeconds: { 'youtube.com': 80 * 60, 'instagram.com': 31 * 60 },
    passesActive: { 'youtube.com': true },
    passesUsed: { 'youtube.com': 1 },
  },
  history: {
    [todayKey]: {
      perSite: {},
      totalSec: 0,
      overrides: [{ site: 'youtube.com', ts: now - 5 * 60 * 1000, affirmed: true }],
    },
    [yesterdayKey]: {
      perSite: { 'instagram.com': 20 * 60 },
      totalSec: 20 * 60,
      overrides: [{ site: 'instagram.com', ts: now - 26 * 3600 * 1000, affirmed: true }],
    },
    [twoDaysAgoKey]: {
      perSite: { 'youtube.com': 45 * 60 },
      totalSec: 45 * 60,
      overrides: [],
    },
  },
});
await sleep(300); // let the worker's lazy-roll settle before page reads

const page = await ctx.newPage();
await page.goto(`chrome-extension://${id}/stats.html`);
await page.waitForSelector('.history-row', { timeout: 5000 });
const body = await page.textContent('body');

// Today: per-site usage, limits, pass counts, active-pass badge.
assert.ok(body.includes('1h 20m of 60m limit · passes 1/1'), `yt row missing:\n${body}`);
assert.ok(body.includes('31m of 30m limit · passes 0/2'), 'ig row missing');
assert.ok(body.includes('day-pass active'), 'active pass badge missing');
// Combined budget (80 + 31 = 111 minutes).
assert.ok(body.includes('1h 51m of 120m'), 'combined budget row missing');
// Overrides with timestamp under Today; today must NOT be a history row.
assert.ok(body.includes('Day-passes used today'), 'today overrides section missing');
assert.ok(/youtube\.com — \d{1,2}:\d{2}/.test(body), 'override timestamp missing');
assert.ok(body.includes('Recent days'), 'history section missing');
assert.ok(!body.includes(todayKey), 'today leaked into history list');
// Closed days newest-first with totals, per-site detail and pass counts.
assert.ok(body.includes(yesterdayKey) && body.includes(twoDaysAgoKey), 'history day keys missing');
assert.ok(body.includes('1 pass(es) used'), 'history override count missing');
assert.ok(body.includes('instagram.com 20m'), 'history per-site detail missing');
assert.ok(body.includes('45m'), 'history day total missing');

const rows = await page.$$('.history-row');
assert.strictEqual(rows.length, 2, `expected exactly 2 closed days, got ${rows.length}`);

// Live update: a storage change re-renders without reload.
await seed({
  state: {
    version: 1,
    dayStart: dayStartAt(now),
    perSiteSeconds: { 'youtube.com': 90 * 60, 'instagram.com': 31 * 60 },
    passesActive: { 'youtube.com': true },
    passesUsed: { 'youtube.com': 1 },
  },
});
await page.waitForFunction(
  () => document.body.textContent.includes('1h 30m of 60m limit'),
  null,
  { timeout: 5000 },
);

await page.close();
await ctx.close();
console.log('VERIFY 7.1 PASS');
