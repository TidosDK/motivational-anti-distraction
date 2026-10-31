// Task 5.1 verification: dNR session-rule sync. Seeding an exhausted site
// must (a) create a dynamic redirect rule and (b) actually redirect a real
// main-frame navigation to the interstitial; recovering the budget removes
// the rule.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, readRules } = await launchBrave();

const settings = {
  version: 1,
  sites: [{ domain: 'example.com', limitMin: 10, passes: 1 }],
  combinedBudgetMin: 120,
  resetHour: 5,
};

async function waitForRules(pred, timeoutMs = 10_000) {
  const t0 = Date.now();
  for (;;) {
    const rules = await readRules();
    if (pred(rules)) return rules;
    if (Date.now() - t0 > timeoutMs) return rules;
    await sleep(250);
  }
}

// --- exhausted ⇒ rule appears -------------------------------------------------
const dayStart = await (async () => {
  // Compute the current usage-day start the same way the extension does.
  const d = new Date();
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  d.setHours(5, 0, 0, 0);
  return d.getTime();
})();

await seed({
  settings,
  state: {
    version: 1,
    dayStart,
    perSiteSeconds: { 'example.com': 11 * 60 }, // 11 min of a 10 min limit
    passesActive: {},
    passesUsed: {},
  },
});

let rules = await waitForRules((r) => r.length > 0);
assert.strictEqual(rules.length, 1, `expected 1 rule, got ${JSON.stringify(rules)}`);
const rule = rules[0];
assert.ok(
  rule.action.redirect.url.includes('/interstitial.html?s=example.com'),
  `wrong redirect: ${rule.action.redirect.url}`,
);
assert.strictEqual(rule.condition.resourceTypes.join(), 'main_frame');

// --- a real navigation is redirected -------------------------------------------
const tab = await ctx.newPage();
await tab.goto('https://example.com');
assert.ok(
  tab.url().includes('/interstitial.html?s=example.com'),
  `navigation not redirected: ${tab.url()}`,
);
const headline = await tab.textContent('#headline');
assert.ok(headline.includes('example.com'), `headline wrong: ${headline}`);
await tab.close();

// --- subdomains are redirected too ----------------------------------------------
const sub = await ctx.newPage();
await sub.goto('https://www.example.com');
assert.ok(
  sub.url().includes('/interstitial.html?s=example.com'),
  `subdomain not redirected: ${sub.url()}`,
);
await sub.close();

// --- recovering the budget removes the rule --------------------------------------
const dayStart2 = dayStart;
await seed({
  settings,
  state: { version: 1, dayStart: dayStart2, perSiteSeconds: { 'example.com': 60 }, passesActive: {}, passesUsed: {} },
});
rules = await waitForRules((r) => r.length === 0);
assert.strictEqual(rules.length, 0, `rule not removed: ${JSON.stringify(rules)}`);

await tab.close().catch(() => {});
await ctx.close();
console.log('VERIFY 5.1 PASS');
