// Task 5.2 verification: spending a day-pass unblocks ONLY that site (other
// exhausted sites stay blocked), and after the usage day rolls the pass is
// expired — a re-exhausted site is blocked again without needing a new pass.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, readRules, readStorage, withExtPage } = await launchBrave();

const sites = [
  { domain: 'example.com', limitMin: 10, passes: 1 },
  { domain: 'example.org', limitMin: 10, passes: 1 },
];
const settings = { version: 1, sites, combinedBudgetMin: 120, resetHour: 5 };

function dayStartTime(base = Date.now()) {
  const d = new Date(base);
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  d.setHours(5, 0, 0, 0);
  return d.getTime();
}

async function waitFor(pred, msg, timeoutMs = 10_000) {
  const t0 = Date.now();
  for (;;) {
    if (await pred()) return;
    if (Date.now() - t0 > timeoutMs) assert.fail(msg);
    await sleep(250);
  }
}

// Both sites exhausted, no passes yet ⇒ both blocked (2 rules).
await seed({
  settings,
  state: {
    version: 1,
    dayStart: dayStartTime(),
    perSiteSeconds: { 'example.com': 11 * 60, 'example.org': 11 * 60 },
    passesActive: {},
    passesUsed: {},
  },
});
await waitFor(async () => (await readRules()).length === 2, 'expected 2 rules after exhausting both sites');

// Spend a pass on example.com via the same message the interstitial sends.
const res = await withExtPage(() => chrome.runtime.sendMessage({ type: 'spendPass', domain: 'example.com' }));
assert.ok(res?.ok, `spendPass failed: ${JSON.stringify(res)}`);

await waitFor(
  async () => {
    const urls = (await readRules()).map((r) => r.action.redirect.url);
    return urls.length === 1 && urls[0].includes('s=example.org');
  },
  'pass did not unblock exactly example.com',
);

// Real navigations agree: .com loads, .org is still intercepted.
const a = await ctx.newPage();
await a.goto('https://example.com');
assert.ok(!a.url().includes('interstitial'), `example.com still redirected: ${a.url()}`);
await a.goto('https://example.org');
assert.ok(a.url().includes('interstitial.html?s=example.org'), `example.org not blocked: ${a.url()}`);
await a.close();

// --- day rolls: pass expires ----------------------------------------------------
// Simulate crossing the reset boundary: stored state still carries yesterday's
// dayStart with the active pass; any worker read must lazily roll it away.
const yesterday = dayStartTime() - 24 * 3600 * 1000;
await seed({
  settings,
  state: {
    version: 1,
    dayStart: yesterday,
    perSiteSeconds: { 'example.com': 11 * 60, 'example.org': 11 * 60 },
    passesActive: { 'example.com': true },
    passesUsed: { 'example.com': 1 },
  },
});
await waitFor(async () => {
  const s = await readStorage(['state']);
  return s.state?.dayStart === dayStartTime();
}, 'state did not roll to the new usage day');

const rolled = await readStorage(['state']);
assert.deepStrictEqual(rolled.state.passesActive, {}, 'pass survived the day roll');
assert.deepStrictEqual(rolled.state.passesUsed, {}, 'pass counter survived the day roll');

// Re-exhaust example.com on the new day: with the pass expired it must block.
await seed({
  settings,
  state: {
    version: 1,
    dayStart: dayStartTime(),
    perSiteSeconds: { 'example.com': 11 * 60, 'example.org': 11 * 60 },
    passesActive: {},
    passesUsed: {},
  },
});
await waitFor(
  async () => (await readRules()).length === 2,
  'site not re-blocked after roll despite expired pass',
);
const b = await ctx.newPage();
await b.goto('https://example.com');
assert.ok(b.url().includes('interstitial.html?s=example.com'), `expired pass let site through: ${b.url()}`);
await b.close();

await ctx.close();
console.log('VERIFY 5.2 PASS');
