// Task 10.3 verification: multi-monitor foreground accounting.
//  - Two browser windows, one per blocked site; only one can have focus.
//    Both must accrue at real time (the old focus-only logic accrued 0 for
//    the unfocused window — this fails hard on the old behavior).
//  - The same domain active in two windows must charge ONCE, not twice.
//  - Closing a window stops its sites; other windows keep accruing.
// Slow (~4.5 min): it observes real alarm ticks in real time.
import assert from 'node:assert';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, readStorage } = await launchBrave();
const page1 = await ctx.newPage();
const cdp = await ctx.newCDPSession(page1);

const settings = {
  version: 1,
  sites: [
    { domain: 'example.com', limitMin: 10, passes: 1 },
    { domain: 'example.org', limitMin: 10, passes: 1 },
  ],
  combinedBudgetMin: 120,
  resetHour: 5,
  passSessionMin: 10,
};
await seed({ settings });

const closed = new Set();

async function newWindowTab(url) {
  const { targetId } = await cdp.send('Target.createTarget', { url, newWindow: true });
  await sleep(2000); // let it load; tabs.onUpdated opens the session
  return targetId;
}

/** Force a worker flush for a tab by reloading it (navigations persist usage). */
async function flushViaReload(targetId) {
  if (closed.has(targetId)) return;
  try {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.reload', { sessionId });
    await sleep(1200);
    await cdp.send('Target.detachFromTarget', { sessionId });
  } catch {
    /* target gone */
  }
}

const tracked = [];

/** Flush every tracked site tab, then read persisted usage. */
async function usage() {
  await page1.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  for (const t of tracked) await flushViaReload(t);
  await sleep(800);
  const s = await readStorage(['state']);
  return s.state?.perSiteSeconds ?? {};
}

// --- setup: window 1 = example.com (focused), window 2 = example.org (not) ---
await page1.goto('https://example.com', { waitUntil: 'domcontentloaded' });
const orgT = await newWindowTab('https://example.org');
tracked.push(orgT);

let u = await usage();
assert.ok((u['example.com'] ?? 0) >= 1, `example.com not tracked: ${JSON.stringify(u)}`);
assert.ok(
  (u['example.org'] ?? 0) >= 1,
  `example.org in the UNFOCUSED second window not tracked: ${JSON.stringify(u)}`,
);
console.log('both windows tracked');

// --- phase 1: 80s with the unfocused window open ------------------------------
console.log('80s with example.org unfocused on "monitor two"...');
await sleep(80_000);
u = await usage();
console.log(`accrued: com=${u['example.com']}s org=${u['example.org']}s`);
assert.ok(u['example.com'] >= 70, `focused window accrued only ${u['example.com']}s`);
assert.ok(
  u['example.org'] >= 70,
  `unfocused second window accrued only ${u['example.org']}s (focus-only bug)`,
);
const afterP1 = { ...u };

// --- phase 2: example.com active in TWO windows must charge once --------------
console.log('70s with example.com active in two windows (dedupe)...');
const com2T = await newWindowTab('https://example.com');
tracked.push(com2T);
await sleep(70_000);
u = await usage();
const dCom = u['example.com'] - afterP1['example.com'];
const dOrg = u['example.org'] - afterP1['example.org'];
console.log(`delta over 70s: com=${dCom.toFixed(1)}s org=${dOrg.toFixed(1)}s`);
assert.ok(dCom >= 60 && dCom <= 100, `same-domain double count or stall: com delta ${dCom}s`);
assert.ok(dOrg >= 55, `example.org stalled while com doubled: ${dOrg}s`);
const afterP2 = { ...u };

// --- phase 3: close org + second com window; com continues, org stops ---------
console.log('60s after closing the other two windows...');
for (const t of [orgT, com2T]) {
  closed.add(t);
  await cdp.send('Target.closeTarget', { targetId: t }).catch(() => {});
}
await sleep(4000);
u = await usage();
const base = { ...u };
await sleep(60_000);
u = await usage();
const dCom2 = u['example.com'] - base['example.com'];
const dOrg2 = (u['example.org'] ?? 0) - base['example.org'];
console.log(`delta over 60s: com=${dCom2.toFixed(1)}s org=${dOrg2.toFixed(1)}s`);
assert.ok(dCom2 >= 50, `example.com stopped accruing after siblings closed: ${dCom2}s`);
assert.ok(dOrg2 <= 2, `example.org kept accruing after its window closed: ${dOrg2}s`);

await ctx.close();
console.log('VERIFY 10.3 PASS');
