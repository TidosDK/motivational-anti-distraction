// Bug regression (user report 2026-11-08): during PASSIVE watching (video
// running, zero interaction) the stats must keep climbing at real time.
// Root cause was a wake-up race: the tick alarm woke the worker, acted on the
// not-yet-restored session map, skipped the flush and cleared the alarm —
// stats froze until the user clicked/navigated again.
//
// Both site windows are created as plain CDP targets (Playwright's newPage
// tabs can get deactivated behind the scenes, which would legitimately stop
// counting). Reads go through a detached extension page in its OWN window
// wrapped as a Playwright page (long-lived raw CDP sessions get crossed
// between windows in headless Chrome), so reading never deactivates a site
// tab and cannot mask the bug via an event-triggered flush. ~2 min.
import assert from 'node:assert';
import { launchBrave, sleep, extensionId } from './helpers.mjs';

const { ctx, seed } = await launchBrave();
const id = extensionId();
const host = ctx.pages()[0] ?? (await ctx.newPage());
const cdp = await ctx.newCDPSession(host);

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

// --- reader window: options.html; own window, so reads touch no site tab ----
const extUrl = `chrome-extension://${id}/options.html`;
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true });
{
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await sleep(500);
  await cdp.send('Page.navigate', { url: extUrl }, { sessionId });
}
let reader;
for (let i = 0; i < 30 && !reader; i++) {
  await sleep(300);
  reader = ctx.pages().find((p) => p.url() === extUrl);
}
assert.ok(reader, 'reader extension window never appeared');
const readUsage = () =>
  reader.evaluate(() =>
    chrome.storage.local.get('state').then((s) => s.state?.perSiteSeconds ?? {}),
  );
// Sessions are persisted the moment they open; usage numbers only appear on
// the next flush (tick or event), so "is it tracked?" is answered by the map.
const readSessions = () =>
  reader.evaluate(() =>
    chrome.storage.local.get('activeSession').then((s) => Object.values(s.activeSession?.sessions ?? {}).map((x) => x.domain)),
  );

// --- the two "monitors": each site is its window's active tab ---------------
await cdp.send('Target.createTarget', { url: 'https://example.com', newWindow: true });
await sleep(1500);
await cdp.send('Target.createTarget', { url: 'https://example.org', newWindow: true });
await sleep(1500);

const sess0 = (await readSessions()).sort();
console.log('open sessions:', JSON.stringify(sess0));
assert.deepStrictEqual(sess0, ['example.com', 'example.org'], 'both sites must be tracked');
const u0 = await readUsage();
console.log('initial usage:', JSON.stringify(u0));

console.log('95s of completely passive watching (no events at all)...');
await sleep(95_000);

const u1 = await readUsage();
const dCom = (u1['example.com'] ?? 0) - (u0['example.com'] ?? 0);
const dOrg = (u1['example.org'] ?? 0) - (u0['example.org'] ?? 0);
console.log(`delta over 95s idle: com=${dCom.toFixed(1)}s org=${dOrg.toFixed(1)}s`);
assert.ok(dCom >= 55, `example.com froze while idle (${dCom.toFixed(1)}s) — wake-up race regression`);
assert.ok(dOrg >= 55, `example.org froze while idle (${dOrg.toFixed(1)}s) — wake-up race regression`);

await ctx.close();
console.log('VERIFY 10.5 PASS');
