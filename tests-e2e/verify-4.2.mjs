// Task 4.2 verification: foreground minutes accrue in state.perSiteSeconds
// (via a real 1-minute chrome.alarms flush); background tabs do not accrue.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, readStorage } = await launchBrave();

await seed({
  settings: {
    version: 1,
    sites: [{ domain: 'example.com', limitMin: null, passes: 1 }],
    combinedBudgetMin: 120,
    resetHour: 5,
  },
});

const page = await ctx.newPage();
await page.goto('https://example.com');
console.log('foreground on example.com for 75s (real alarm tick expected once)...');
await sleep(75_000);

const s1 = await readStorage(['state']);
const sec1 = s1.state?.perSiteSeconds?.['example.com'] ?? 0;
console.log('accrued after 75s foreground:', sec1, 's');
assert.ok(sec1 >= 55, `expected >= 55s accrued, got ${sec1}`);

const bg = await ctx.newPage();
await bg.goto('about:blank');
console.log('backgrounding example.com for 15s...');
await sleep(15_000);

const s2 = await readStorage(['state']);
const sec2 = s2.state?.perSiteSeconds?.['example.com'] ?? 0;
console.log('delta while backgrounded:', sec2 - sec1, 's');
assert.ok(sec2 - sec1 < 5, `background tab accrued ${sec2 - sec1}s`);

await ctx.close();
console.log('VERIFY 4.2 PASS');
