// Task 6.1 verification: interstitial ceremony gates. Quote shows, fixed
// confessions render, the button stays disabled until BOTH the 30s lockout
// has elapsed AND every confession is checked (each gate independently),
// and reloading restarts the lockout.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, readRules } = await launchBrave();

function dayStartTime() {
  const d = new Date();
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  d.setHours(5, 0, 0, 0);
  return d.getTime();
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
  passesActive: {},
  passesUsed: {},
};
await seed({ settings, state: exhausted });
// Wait until the redirect rule is live so the navigation can't beat it.
{
  const t0 = Date.now();
  for (;;) {
    if ((await readRules()).length === 1) break;
    assert.ok(Date.now() - t0 < 10_000, 'rule never installed');
    await sleep(250);
  }
}

const page = await ctx.newPage();
await page.goto('https://example.com');
assert.ok(page.url().includes('interstitial.html?s=example.com'), `not redirected: ${page.url()}`);

await page.waitForSelector('#ceremony:not([hidden])');

// Headline + quote.
assert.ok((await page.textContent('#headline')).includes('example.com'));
const quote = (await page.textContent('#quote')).trim();
assert.ok(quote.length > 20, `quote missing/short: ${quote}`);
assert.ok((await page.textContent('#quote')).includes('—'), 'quote lacks attribution');

// Fixed confession list: 4 checkboxes, exact expected labels.
const labels = await page.$$eval('#confessions label span', (els) => els.map((e) => e.textContent));
assert.deepStrictEqual(labels, [
  'This is for work',
  'I am NOT slacking off right now!',
  'I will close this tab when I’m done',
  'I could be doing my actual task right now',
]);

// Countdown runs: label shows a decreasing second count.
const t1 = await page.textContent('#timer-label');
assert.match(t1.trim(), /^\d+s$/, `timer label not a countdown: ${t1}`);
await sleep(1200);
const t2 = await page.textContent('#timer-label');
const secs = (s) => parseInt(s, 10);
assert.ok(secs(t1) > secs(t2), `timer not decreasing: ${t1} → ${t2}`);

// Gate 1 (lockout): all boxes checked, but button must stay disabled < 30s.
await page.$$eval('#confessions input[type=checkbox]', (els) =>
  els.forEach((el) => { el.click(); }),
);
await sleep(500);
assert.strictEqual(await page.isDisabled('#override'), true, 'button enabled during lockout!');

// Reload restarts the lockout (anti-cheat): near-fresh countdown after reload.
await page.reload();
await page.waitForSelector('#ceremony:not([hidden])');
const after = secs((await page.textContent('#timer-label')).trim());
assert.ok(after >= 28, `reload did not restart countdown: ${after}s`);
assert.strictEqual(await page.isDisabled('#override'), true);

// Wait out the lockout WITHOUT checking boxes → gate 2 (confessions) holds.
await sleep(31_000);
const boxes = await page.$$('#confessions input[type=checkbox]');
const checked = await Promise.all(boxes.map((b) => b.isChecked()));
assert.strictEqual(checked.every(Boolean), false, 'boxes unexpectedly still checked after reload');
assert.strictEqual(await page.isDisabled('#override'), true, 'button enabled without all confessions!');

// Check them all now → both gates satisfied → enabled.
for (const b of boxes) await b.click();
await page.waitForFunction(() => !document.querySelector('#override').disabled, null, { timeout: 3000 });
assert.strictEqual(await page.isDisabled('#override'), false);

// Un-checking one box disables again.
await boxes[0].click();
assert.strictEqual(await page.isDisabled('#override'), true, 'button stayed enabled with a box unchecked');

await ctx.close();
console.log('VERIFY 6.1 PASS');
