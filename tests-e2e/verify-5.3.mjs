// Task 5.3 verification: the day-roll alarm is scheduled exactly at the next
// reset boundary, and when it fires the handler refreshes the block rules
// and reschedules itself. Proving the handler re-syncs rules is done by
// tampering: deleting the dynamic rule WITHOUT any storage write leaves an
// inconsistent state that only the alarm handler (or another trigger) can
// repair. The roll itself is verified end-to-end in 5.2 and in unit tests.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, readRules, withExtPage } = await launchBrave();

const RESET = 5;
function dayStartTime(base = Date.now()) {
  const d = new Date(base);
  if (d.getHours() < RESET) d.setDate(d.getDate() - 1);
  d.setHours(RESET, 0, 0, 0);
  return d.getTime();
}
function nextResetTime(base = Date.now()) {
  const d = new Date(dayStartTime(base));
  d.setDate(d.getDate() + 1);
  d.setHours(RESET, 0, 0, 0);
  return d.getTime();
}

// 1. At startup the worker must have scheduled day-roll at the reset boundary.
const t0 = Date.now();
let roll;
for (;;) {
  const alarms = await withExtPage(() => chrome.alarms.getAll());
  roll = alarms.find((a) => a.name === 'day-roll');
  if (roll || Date.now() - t0 > 10_000) break;
  await sleep(300);
}
assert.ok(roll, 'day-roll alarm not scheduled at startup');
const skew = Math.abs(roll.scheduledTime - (nextResetTime() + 250));
assert.ok(skew < 5_000, `alarm not scheduled at reset boundary: skew ${skew}ms`);

// 2. Exhausted site ⇒ blocked.
await seed({
  settings: {
    version: 1,
    sites: [{ domain: 'example.com', limitMin: 10, passes: 1 }],
    combinedBudgetMin: 120,
    resetHour: RESET,
  },
  state: {
    version: 1,
    dayStart: dayStartTime(),
    perSiteSeconds: { 'example.com': 11 * 60 },
    passesUntil: {},
    passesUsed: {},
  },
});
const t1 = Date.now();
for (;;) {
  if ((await readRules()).length === 1) break;
  assert.ok(Date.now() - t1 < 10_000, 'rule never appeared');
  await sleep(250);
}

// 3. Tamper: delete the rule directly (no storage write ⇒ no refresh trigger).
await withExtPage(() =>
  chrome.declarativeNetRequest.getDynamicRules().then((rs) =>
    chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: rs.map((r) => r.id) }),
  ),
);
await sleep(3000); // give any incidental focus/init refresh a chance to mask the test
assert.strictEqual((await readRules()).length, 0, 'something else already refreshed the rules (test inconclusive)');

// 4. Fire day-roll in ~1s: the handler must re-sync rules and reschedule.
await withExtPage(() => chrome.alarms.create('day-roll', { when: Date.now() + 1000 }));
const t2 = Date.now();
for (;;) {
  const [rules, alarms] = await Promise.all([
    readRules(),
    withExtPage(() => chrome.alarms.getAll()),
  ]);
  const rescheduled = alarms.some(
    (a) => a.name === 'day-roll' && Math.abs(a.scheduledTime - (nextResetTime() + 250)) < 5_000,
  );
  if (rules.length === 1 && rescheduled) break;
  assert.ok(Date.now() - t2 < 15_000, 'alarm firing did not re-sync rules / reschedule');
  await sleep(400);
}

// 5. Blocking is intact again.
const page = await ctx.newPage();
await page.goto('https://example.com');
assert.ok(page.url().includes('interstitial.html?s=example.com'), `not re-blocked: ${page.url()}`);
await page.close();

await ctx.close();
console.log('VERIFY 5.3 PASS');
