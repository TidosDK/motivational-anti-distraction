// Task 9.3 verification: a spent day-pass opens the site for a timed session,
// the site re-blocks by itself when the session lapses (no user action), the
// next pass is then offered, and a spend while a session is active does not
// consume a second pass.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, readRules, readStorage, withExtPage } = await launchBrave();

function dayStartTime() {
  const d = new Date();
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  d.setHours(5, 0, 0, 0);
  return d.getTime();
}

const settings = {
  version: 1,
  sites: [{ domain: 'example.com', limitMin: 10, passes: 2 }],
  combinedBudgetMin: 120,
  resetHour: 5,
  passSessionMin: 1, // one-minute session keeps the test ~70s
};
const exhausted = {
  version: 1,
  dayStart: dayStartTime(),
  perSiteSeconds: { 'example.com': 11 * 60 },
  passesUntil: {},
  passesUsed: {},
};

async function waitFor(pred, msg, ms = 15_000) {
  const t0 = Date.now();
  for (;;) {
    if (await pred()) return;
    assert.ok(Date.now() - t0 < ms, msg);
    await sleep(300);
  }
}

// Blocked initially.
await seed({ settings, state: exhausted });
await waitFor(async () => (await readRules()).length === 1, 'site not blocked initially');
const page = await ctx.newPage();
await page.goto('https://example.com');
assert.ok(page.url().includes('interstitial'), 'expected block before pass');

// Spend a pass (equivalent to completing the ceremony).
const spend = await withExtPage(() => chrome.runtime.sendMessage({ type: 'spendPass', domain: 'example.com' }));
assert.ok(spend?.ok, `spendPass failed: ${JSON.stringify(spend)}`);
assert.ok(spend.expiresAt > Date.now() && spend.expiresAt <= Date.now() + 65_000,
  `expiry not ~1 min out: ${spend.expiresAt}`);

await waitFor(async () => (await readRules()).length === 0, 'pass did not unblock the site');
await page.goto('https://example.com');
assert.ok(!page.url().includes('interstitial'), `blocked during session: ${page.url()}`);

// Spending again mid-session reuses the session and does NOT spend pass #2.
const again = await withExtPage(() => chrome.runtime.sendMessage({ type: 'spendPass', domain: 'example.com' }));
assert.ok(again?.ok, 'second spend should reuse, not fail');
const midState = await readStorage(['state']);
assert.strictEqual(midState.state.passesUsed['example.com'], 1, 'double-spent a pass during active session');

// Wait for the session to lapse and the rules to re-sync (pass-expire alarm).
console.log('waiting for the 1-minute pass session to expire...');
await waitFor(async () => (await readRules()).length === 1, 'site did not re-block after the session expired', 100_000);

// Navigation is intercepted again.
await page.goto('https://example.com');
assert.ok(page.url().includes('interstitial.html?s=example.com'), `not re-blocked: ${page.url()}`);

// The next pass is offered (not a hard block): 2 total, 1 used → ceremony.
const status = await withExtPage(() =>
  chrome.runtime.sendMessage({ type: 'siteStatus', domain: 'example.com' }),
);
assert.strictEqual(status.passesActive, false);
assert.strictEqual(status.exhausted, true);
assert.strictEqual(status.passesTotal, 2);
assert.strictEqual(status.passesUsed, 1);
assert.ok((await page.isVisible('#ceremony')) === true || (await page.isVisible('#hard-block')) === false,
  'expired session with passes left must offer the ceremony, not the hard block');

await page.close();
await ctx.close();
console.log('VERIFY 9.3 PASS');
