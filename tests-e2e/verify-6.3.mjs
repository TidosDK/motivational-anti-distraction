// Task 6.3 verification: full ceremony → Quick Override spends the day-pass,
// records the affirmed override, unblocks the site, and replaces the
// interstitial with the real site. Also checks the hard-block display when
// no passes remain.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, readRules, readStorage } = await launchBrave();

function dayStartTime() {
  const d = new Date();
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  d.setHours(5, 0, 0, 0);
  return d.getTime();
}
function todayKey() {
  const d = new Date(dayStartTime());
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const settings = {
  version: 1,
  sites: [{ domain: 'example.com', limitMin: 10, passes: 1 }],
  combinedBudgetMin: 120,
  resetHour: 5,
};
const exhausted = {
  version: 1,
  dayStart: dayStartTime(),
  perSiteSeconds: { 'example.com': 11 * 60 },
  passesUntil: {},
  passesUsed: {},
};
async function waitRules(count) {
  const t0 = Date.now();
  for (;;) {
    if ((await readRules()).length === count) return;
    assert.ok(Date.now() - t0 < 10_000, `rules never reached ${count}`);
    await sleep(250);
  }
}

// --- hard block: exhausted, pass already used ----------------------------------
await seed({
  settings,
  state: { ...exhausted, passesUsed: { 'example.com': 1 } },
});
await waitRules(1);
const page = await ctx.newPage();
await page.goto('https://example.com');
assert.ok(page.url().includes('interstitial.html'), `not redirected: ${page.url()}`);
await page.waitForSelector('#hard-block:not([hidden])', { timeout: 5000 });
assert.ok((await page.textContent('#hard-block')).includes('No day-passes left'));
assert.strictEqual(await page.isVisible('#ceremony'), false, 'ceremony shown without passes');
await page.close();

// --- fresh day-pass: full ceremony flow ------------------------------------------
await seed({ settings, state: exhausted });
await waitRules(1);

const tab = await ctx.newPage();
await tab.goto('https://example.com');
assert.ok(tab.url().includes('interstitial.html?s=example.com'));
await tab.waitForSelector('#ceremony:not([hidden])');
assert.ok((await tab.textContent('#passes-left')).includes('1 of 1'));

await tab.$$eval('#confessions input[type=checkbox]', (els) => els.forEach((el) => el.click()));
await tab.waitForFunction(() => !document.querySelector('#override').disabled, null, { timeout: 40_000 });

await tab.click('#override');
await tab.waitForFunction(() => location.href.startsWith('https://example.com'), null, { timeout: 10_000 });
assert.ok(!tab.url().includes('interstitial'), `not on the real site: ${tab.url()}`);

// The pass is spent and recorded (as a timed session), and the site is unblocked.
const s = await readStorage(['state', 'history']);
assert.ok((s.state.passesUntil['example.com'] ?? 0) > Date.now(), 'pass session not active');
assert.strictEqual(s.state.passesUsed['example.com'], 1, 'pass not counted');
const ov = s.history?.[todayKey()]?.overrides ?? [];
assert.strictEqual(ov.length, 1, 'override not recorded in history');
assert.strictEqual(ov[0].site, 'example.com');
assert.strictEqual(ov[0].affirmed, true);
await waitRules(0);

// Navigation now reaches the site directly (pass active).
await tab.goto('https://example.com');
assert.ok(!tab.url().includes('interstitial'), `pass did not persist: ${tab.url()}`);
await tab.close();

await ctx.close();
console.log('VERIFY 6.3 PASS');
