// Task 3.1 verification: remaining-time popup.
//  - Seeded settings + state render per-site remaining, exhausted row,
//    no-per-site-limit row, combined remaining, reset label, options link.
//  - Empty install shows the empty state with the options link.
//  - Storage writes while the popup page is open re-render it live.
// The popup is driven as an extension page (chrome-extension://…/popup.html),
// which is exactly the document Chrome shows in the toolbar dropdown.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, id, seed } = await launchBrave();
const MIN = 60_000;

// Start of the current usage day (resetHour 5), mirrored from dayMath.
const now = new Date();
const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0, 0);
if (now < dayStart) dayStart.setDate(dayStart.getDate() - 1);

const settings = {
  version: 1,
  sites: [
    { domain: 'example.com', limitMin: 60, passes: 1 },
    { domain: 'usedup.com', limitMin: 10, passes: 1 },
    { domain: 'nolimit.com', limitMin: null, passes: 1 },
  ],
  combinedBudgetMin: 120,
  resetHour: 5,
  passSessionMin: 10,
};
// 20m of 60m (40m left), 10m of 10m (exhausted), 7m with no limit ⇒
// combined 37m of 120m ⇒ 83m left.
const state = {
  version: 1,
  dayStart: dayStart.getTime(),
  perSiteSeconds: { 'example.com': 20 * 60, 'usedup.com': 10 * 60, 'nolimit.com': 7 * 60 },
  passesUntil: {},
  passesUsed: {},
};

await seed({ settings, state });

const page = await ctx.newPage();
await page.goto(`chrome-extension://${id}/popup.html`);
await page.waitForFunction(() => document.body.textContent.includes('Combined budget'));
const text = () => page.textContent('body');

assert.match(await text(), /example\.com\s*40m left of 60m · 20m used/, 'per-site remaining');
// Exhausted rows carry the badge between the domain and the sub-line.
assert.match(await text(), /usedup\.comexhausted0s left of 10m · 10m used/, 'exhausted row shown');
assert.match(await text(), /exhausted/, 'exhausted badge');
assert.match(await text(), /nolimit\.com\s*7m used · no per-site limit/, 'no-limit row');
assert.match(await text(), /Combined budget1h 23m left of 120m/, 'combined remaining');
assert.match(await text(), /Resets \d/, 'reset label');
assert.ok(await page.$('#open-options'), 'options link present');
console.log('PASS seeded popup renders remaining per site, combined, reset, options link');

// Live update: accrue 5 more minutes on example.com while the popup is open.
await page.evaluate(() =>
  chrome.storage.local.get('state').then(({ state }) => {
    state.perSiteSeconds['example.com'] += 5 * 60;
    return chrome.storage.local.set({ state });
  }),
);
await page.waitForFunction(() => document.body.textContent.includes('35m left of 60m'), null, {
  timeout: 10_000,
});
console.log('PASS popup re-renders live on storage changes');

// Settings change while open: add a site, popup must list it.
await page.evaluate(() =>
  chrome.storage.local.get('settings').then(({ settings }) => {
    settings.sites.push({ domain: 'freshly-added.com', limitMin: 30, passes: 1 });
    return chrome.storage.local.set({ settings });
  }),
);
await page.waitForFunction(() => document.body.textContent.includes('freshly-added.com'), null, {
  timeout: 10_000,
});
assert.match(await text(), /freshly-added\.com\s*30m left of 30m/, 'new site shows full remaining');
console.log('PASS popup re-renders on settings changes');

// Empty install: no sites blocked.
await seed({
  settings: { ...settings, sites: [] },
  state: { ...state, perSiteSeconds: {} },
});
await page.reload();
await page.waitForFunction(() => document.body.textContent.includes('No sites blocked yet'));
assert.match(await text(), /No sites blocked yet — add some in Options/);
assert.ok(await page.$('#open-options'), 'options link present in empty state');
// Only the combined-budget row remains — no per-site rows.
assert.equal((await page.$$('.usage-row')).length, 1, 'no per-site rows in empty state');
console.log('PASS empty state shows hint + options link');

await sleep(100);
await ctx.close();
console.log('verify-popup: all checks passed');
