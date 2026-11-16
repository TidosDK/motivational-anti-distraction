// Verification for the OpenSpec change add-idle-aware-tracking (task 2.3).
//
// Environment facts this script is built around (verified empirically):
//  - headless Chromium's chrome.idle state mirrors the HOST desktop's real
//    idle state: `locked`/`idle` while nobody touches the machine, `active`
//    when someone does (the Linux best-effort caveat made visible). So the
//    state at wake is environment-dependent — the script reads it and
//    asserts the behavior that must follow in either case.
//  - chrome.runtime.requestRestart() does not exist in this Chromium and
//    chrome.runtime.reload() leaves an unpacked --load-extension install
//    unreachable (ERR_BLOCKED_BY_CLIENT); natural ~30 s eviction is not
//    observable in headless (the SW was still alive after 75 s of silence).
//    Instead the worker is killed over CDP (Target.closeTarget on the
//    service-worker target — DevTools' "terminate service worker"), verified
//    gone via Target.getTargets, then woken by opening an extension page.
//    The fresh worker re-runs init() over whatever storage holds — exactly
//    the wake the guard protects — and neither the kill nor the page-open
//    is user input, so the idle state carries across the restart.
//
// The invariant under test (design D3: no billing for time the user was
// away), over a seeded "worker died mid-session" map (fake window 999's
// session anchored exactly 60 s before savedAt):
//  - wake while the browser reports AWAY (idle/locked): init()'s guard must
//    charge exactly [sinceMs .. savedAt] — 60 s — clear the map, and leave
//    the tick alarm disarmed; every second of the away gap stays unbilled.
//  - wake while ACTIVE (host in use): the retrack path must drop the
//    phantom window's session with NO accrual at all.
// Either way: map empty, tick disarmed, day-roll armed, usage frozen after.
//
// The idle->active pause path cannot fire deterministically here (a real
// away->active transition mid-script would race the host's keyboard); it is
// unit-tested (pauseAllSessions) and verified manually in Brave —
// docs/testing.md step 14 is the verification of record for real idle/lock
// behavior. ~40 s.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { launchBrave, sleep, extensionId, ROOT } from './helpers.mjs';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'manifest.json'), 'utf8'));
assert.ok(manifest.permissions.includes('idle'), "dist manifest.permissions must include 'idle'");

const { ctx, seed } = await launchBrave();
const id = extensionId();
const extUrl = `chrome-extension://${id}/options.html`;

/** SW targets via CDP only — a chrome.* probe would reset the worker timer. */
async function swTargets() {
  const page = ctx.pages().find((p) => !p.isClosed());
  const sess = await ctx.newCDPSession(page);
  const { targetInfos } = await sess.send('Target.getTargets');
  return targetInfos.filter((t) => t.type === 'service_worker' && t.url.includes(id));
}

async function killWorker() {
  const page = ctx.pages().find((p) => !p.isClosed());
  const sess = await ctx.newCDPSession(page);
  for (let i = 0; i < 10; i++) {
    const { targetInfos } = await sess.send('Target.getTargets');
    const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(id));
    if (!sw) return;
    await sess.send('Target.closeTarget', { targetId: sw.targetId }).catch(() => {});
    await sleep(600);
  }
  throw new Error('service worker would not die');
}

const now = Date.now();
const resetHour = 5;
const d = new Date(now);
if (d.getHours() < resetHour) d.setDate(d.getDate() - 1);
d.setHours(resetHour, 0, 0, 0);
const BASE = 300;
const WINDOW_S = 60; // chargeable "last alive" window of the fake session

await seed({
  settings: {
    version: 1,
    sites: [{ domain: 'example.com', limitMin: 30, passes: 1 }],
    combinedBudgetMin: 120,
    resetHour,
    passSessionMin: 10,
  },
  state: {
    version: 1,
    dayStart: d.getTime(),
    perSiteSeconds: { 'example.com': BASE },
    passesUntil: {},
    passesUsed: {},
  },
});

const reader = await ctx.newPage();
await reader.goto(extUrl);
await sleep(1500); // let the init() woken by opening this tab finish

// Seed the fake dead-worker map from the open page (evaluate fires no tab
// events, so the live worker leaves the write alone).
const savedAt = Date.now() - 60_000;
const sinceMs = savedAt - WINDOW_S * 1000;
await reader.evaluate(
  (v) =>
    chrome.storage.local.set({
      activeSession: {
        sessions: { '999': { windowId: 999, tabId: 999, domain: 'example.com', sinceMs: v.sinceMs } },
        savedAt: v.savedAt,
      },
    }),
  { sinceMs, savedAt },
);

// Let the idle state settle (it flips to away ~15 s after input stops; the
// seeding page-open may have counted as activity).
console.log('settling 20 s with zero automation so the idle state stabilises...');
await sleep(20_000);

// The branch decides itself off the environment — read as late as possible;
// neither the kill nor the wake-page open below is user input, so this
// carries across the restart.
const wakeState = await reader.evaluate(() => chrome.idle.queryState(15));
const away = wakeState === 'idle' || wakeState === 'locked';
console.log(`idle state at wake: ${wakeState} -> expect charge ${away ? WINDOW_S : 0}`);

// Kill the worker, then wake it with a fresh extension page: the new
// worker's init() sees the still-seeded map.
await killWorker();
console.log('worker killed over CDP; waking via a fresh extension page...');
const wake = await ctx.newPage();
await wake.goto(extUrl);
await sleep(2500); // let the wake's init() finish

const sessions = await wake.evaluate(() =>
  chrome.storage.local.get('activeSession').then((s) => s.activeSession?.sessions ?? {}),
);
assert.deepEqual(Object.keys(sessions), [], 'wake must not keep sessions for windows that no longer exist');

const alarms = await wake.evaluate(() => chrome.alarms.getAll().then((a) => a.map((x) => x.name)));
assert.ok(!alarms.includes('usage-tick'), `tick alarm must not be armed for the phantom session: ${alarms}`);
assert.ok(alarms.includes('day-roll'), `day-roll must still be scheduled past the wake: ${alarms}`);

const readGain = () =>
  wake.evaluate(
    (base) => chrome.storage.local.get('state').then((s) => (s.state?.perSiteSeconds?.['example.com'] ?? 0) - base),
    BASE,
  );
const gained = await readGain();
console.log(`charged for the restored session: ${gained.toFixed(2)} s (expected ${away ? WINDOW_S : 0})`);
if (away) {
  assert.ok(
    Math.abs(gained - WINDOW_S) < 1,
    `away wake must charge exactly sinceMs..savedAt (0: guard never saw the map; ~${WINDOW_S + 25}+: the away gap was billed)`,
  );
} else {
  assert.ok(gained < 1, `active wake must not bill a session whose window is gone (got ${gained}s)`);
}

// Nothing keeps accruing afterwards: no sessions, tick disarmed.
await sleep(3000);
const later = await readGain();
assert.ok(Math.abs(later - gained) < 0.5, `usage kept growing after the wake: ${gained} -> ${later}`);

await ctx.close();
console.log(`verify-idle: all assertions passed (${away ? 'away-guard' : 'active-retrack'} path)`);
process.exit(0);
