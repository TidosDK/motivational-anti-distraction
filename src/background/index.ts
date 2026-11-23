import { nextReset } from '../shared/dayMath';
import { domainMatches, hostFromUrl } from '../shared/domains';
import { chromeKV, accrueForeground, loadDeck, loadSessions, loadSettings, loadState, loadUsageSnapshot, readStoredState, recordOverride, saveDeck, saveSessions, saveState, withStorageLock } from '../shared/storage';
import { SETTINGS_KEY, STATE_KEY } from '../shared/types';
import { QUOTES } from '../shared/quotes';
import { nextQuote } from '../shared/deck';
import { updateActionStatus } from './actionStatus';
import { computeBlockedDomains, diffRules, regexFilterFor, type RuleSpec } from './enforcement';
import { applyPassSpend, isPassActive, isSiteExhausted } from '../shared/exhaustion';
import { awayChargePlan, closeWindowSession, hasAnySession, isAwayNow, pauseAllSessions, setWindowSession, tickAll, type Segment, type SessionMap } from './accounting';

const TICK_ALARM = 'usage-tick';
const ROLL_ALARM = 'day-roll';
/** One-shot alarms: `pass-expire:<domain>` refreshes rules when a session lapses. */
const PASS_EXPIRE_PREFIX = 'pass-expire:';
/** Idle detection threshold (idle design D2): fixed minimum, caps away
 * over-counting at ~15 s per transition. Not user-configurable — one honest
 * constant. */
const IDLE_DETECTION_SECONDS = 15;

/**
 * Audio-aware away decision (idle designs D4 + D5): `locked` is best-effort
 * on Linux and always away; `idle` — a purely input-based signal — is away
 * only while NO tab plays audible media, so hands-off watching (a video with
 * sound, mouse untouched) keeps counting.
 */
async function awayNow(): Promise<boolean> {
  let state: `${chrome.idle.IdleState}` = 'active';
  try {
    state = await chrome.idle.queryState(IDLE_DETECTION_SECONDS);
  } catch {
    return false; // idle API unavailable: degrade to pre-idle-aware behavior
  }
  if (state === 'active') return false;
  if (state === 'locked') return true;
  const audible = await chrome.tabs.query({ audible: true });
  return isAwayNow(state, audible.length > 0);
}

/**
 * Counted sessions per visible window (design D3, multi-monitor): every
 * window that is not minimized contributes its active tab. Keyboard focus
 * is irrelevant — a blocked site on a second monitor is still watched.
 */
let sessions: SessionMap = {};
/** Windows known to be minimized; their active tabs are not counted. */
const minimizedWindows = new Set<number>();

async function setSessions(next: SessionMap): Promise<void> {
  sessions = next;
  await saveSessions(chromeKV, next, Date.now());
}

async function blockedDomainForUrl(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  const host = hostFromUrl(url);
  if (!host) return null;
  const settings = await loadSettings(chromeKV);
  return settings.sites.find((s) => domainMatches(host, s.domain))?.domain ?? null;
}

async function accrue(seg: Segment | null): Promise<void> {
  if (!seg || seg.toMs <= seg.fromMs) return;
  await withStorageLock(async () => {
    const settings = await loadSettings(chromeKV);
    await accrueForeground(chromeKV, seg.domain, seg.fromMs, seg.toMs, settings);
  });
}

function interstitialUrl(domain: string): string {
  return chrome.runtime.getURL(`/interstitial.html?s=${encodeURIComponent(domain)}`);
}

async function refreshRulesNow(): Promise<void> {
  const { settings, state, now } = await loadUsageSnapshot();
  for (const { domain } of settings.sites) {
    const expiresAt = state.passesUntil[domain];
    if (expiresAt > now) schedulePassExpiry(domain, expiresAt);
  }
  const desired: RuleSpec[] = computeBlockedDomains(settings, state, now).map((domain, i) => ({
    id: i + 1,
    domain,
    redirectUrl: interstitialUrl(domain),
  }));
  const existing = (await chrome.declarativeNetRequest.getDynamicRules()).map((r) => ({
    id: r.id,
    redirectUrl: r.action.redirect?.regexSubstitution ?? r.action.redirect?.url ?? '',
  }));
  const { add, removeIds } = diffRules(desired, existing);
  if (add.length > 0 || removeIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: add.map((r) => ({
        id: r.id,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { url: r.redirectUrl },
        },
        condition: {
          regexFilter: regexFilterFor(r.domain),
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      })),
    });
  }
  await updateActionStatus(settings, state, now).catch((err) => console.error('toolbar status update failed', err));
}

async function refreshBadgeNow(): Promise<void> {
  const { settings, state } = await withStorageLock(async () => ({
    settings: await loadSettings(chromeKV),
    state: await readStoredState(chromeKV),
  }));
  await updateActionStatus(settings, state, Date.now());
}

/**
 * Serialize rule diffs and badge writes so overlapping tab, storage, and
 * alarm events cannot apply an older snapshot after a newer one.
 */
let refreshChain: Promise<void> = Promise.resolve();
function refreshRules(scope: 'all' | 'badge' = 'all'): Promise<void> {
  const run = refreshChain.then(scope === 'all' ? refreshRulesNow : refreshBadgeNow);
  refreshChain = run.catch(() => {});
  return run;
}

async function manageTickAlarm(): Promise<void> {
  if (hasAnySession(sessions)) chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  else await chrome.alarms.clear(TICK_ALARM);
}

async function scheduleDayRoll(): Promise<void> {
  const settings = await loadSettings(chromeKV);
  chrome.alarms.create(ROLL_ALARM, { when: nextReset(Date.now(), settings.resetHour) + 250 });
}

/**
 * Re-sync rules shortly after a pass session lapses, so a site that expires
 * while the browser is idle closes without waiting for the next unrelated
 * event. Correctness never depends on it — expiry is checked lazily.
 */
function schedulePassExpiry(domain: string, expiresAt: number): void {
  chrome.alarms.create(PASS_EXPIRE_PREFIX + domain, { when: Math.max(Date.now() + 1000, expiresAt) });
}

/**
 * Point window `windowId`'s counted session at (tabId, url): flushes the
 * previous domain union (charge-once), then opens a fresh session when the
 * tab shows a blocked site in a non-minimized window.
 */
async function updateWindowTab(windowId: number, tabId: number, url: string | undefined): Promise<void> {
  const domain = minimizedWindows.has(windowId) ? null : await blockedDomainForUrl(url);
  const r = setWindowSession(sessions, windowId, domain, tabId, Date.now());
  await setSessions(r.next);
  const accrued = r.segment != null;
  await accrue(r.segment);
  await manageTickAlarm();
  // Switching tabs or navigating can change the badge without changing usage.
  await refreshRules(accrued ? 'all' : 'badge');
}

/** Re-read a window's current active tab and track it. */
async function trackActiveTabOf(windowId: number): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ windowId, active: true });
    await updateWindowTab(windowId, tab?.id ?? -1, tab?.url);
  } catch {
    /* window vanished */
  }
}

/** Drop a window's session and flush its pending time. */
async function dropWindow(windowId: number): Promise<void> {
  const r = closeWindowSession(sessions, windowId, Date.now());
  await setSessions(r.next);
  await accrue(r.segment);
  await manageTickAlarm();
}

// --- tab / window events -------------------------------------------------------
// Every visible window counts; focus changes are deliberately NOT tracked.
// All handlers first await `ready`: when an event (or the tick alarm) WAKES
// the worker, init() is still mid-flight, and acting on the not-yet-restored
// session map would drop or double-anchor live sessions — that race used to
// silently skip accruals while a video played with no further events.

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void (async () => {
    await ready;
    try {
      const tab = await chrome.tabs.get(tabId);
      await updateWindowTab(windowId, tabId, tab.url);
    } catch {
      /* tab vanished */
    }
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.audible !== undefined) {
    // Audible start/stop changes the away decision (design D5): the video
    // ended while idle -> pause now; autoplay started while idle -> resume.
    void (async () => {
      await ready;
      await reevaluateAway();
    })();
  }
  if (!tab.active) return;
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
    void (async () => {
      await ready;
      await updateWindowTab(tab.windowId, tabId, tab.url);
    })();
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  void (async () => {
    await ready;
    const cur = sessions[String(removeInfo.windowId)];
    if (cur?.tabId !== tabId) return; // a background tab closed; nothing tracked
    if (removeInfo.isWindowClosing) await dropWindow(removeInfo.windowId);
    else await trackActiveTabOf(removeInfo.windowId);
  })();
});

chrome.windows.onRemoved.addListener((windowId) => {
  void (async () => {
    await ready;
    minimizedWindows.delete(windowId);
    await dropWindow(windowId);
  })();
});

// Minimize/restore (also fires on resize/maximize — harmless re-anchoring).
// Chrome >= 148 passes the full Window; older Chrome/Brave pass the windowId,
// so the state is always re-queried instead of trusted from the event.
chrome.windows.onBoundsChanged.addListener((windowOrId: chrome.windows.Window | number) => {
  void (async () => {
    await ready;
    const windowId = typeof windowOrId === 'number' ? windowOrId : windowOrId.id;
    if (windowId == null) return;
    try {
      const w = await chrome.windows.get(windowId);
      if (w.state === 'minimized') {
        minimizedWindows.add(windowId);
        await dropWindow(windowId);
      } else {
        minimizedWindows.delete(windowId);
        await trackActiveTabOf(windowId);
      }
    } catch {
      /* window vanished */
    }
  })();
});

// --- idle / screen lock ---------------------------------------------------------
// Away pauses by flushing and clearing every window session — the same
// flush-and-clear invariant that makes minimize/restore correct (idle design
// D1). On resume the same re-enumeration as startup anchors fresh sessions
// at the return moment, so no part of the away gap is ever billed. Events
// missed while the worker slept are covered by init()'s away guard. The
// decision is audio-aware (design D5): idle pauses only while nothing is
// audible; locked always pauses; audio starting/stopping re-runs it.

/** Whether the worker currently considers the user away (null: unknown). */
let awayKnown: boolean | null = null;

/** Serialize re-evaluations: idle events and audible flips can overlap. */
let awayChain: Promise<void> = Promise.resolve();
function reevaluateAway(): Promise<void> {
  awayChain = awayChain
    .then(async () => {
      const away = await awayNow();
      const wasAway = awayKnown === true;
      awayKnown = away;
      if (away) {
        if (!hasAnySession(sessions)) return;
        const r = pauseAllSessions(sessions, Date.now());
        await setSessions(r.next);
        for (const seg of r.segments) await accrue(seg);
        await manageTickAlarm();
        await refreshRules();
      } else if (wasAway) {
        await retrackAllVisibleWindows();
        await refreshRules();
      }
    })
    .catch((err) => console.error('away evaluation failed', err));
  return awayChain;
}

chrome.idle.onStateChanged.addListener(() => {
  void (async () => {
    await ready;
    await reevaluateAway();
  })();
});

// --- alarms --------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) {
    void (async () => {
      // On an alarm wake-up init() must finish first: until it re-enumerates
      // the visible windows the session map is empty and there is nothing to
      // flush (clearing the alarm based on that empty map was the bug that
      // froze stats during passive video watching).
      await ready;
      if (!hasAnySession(sessions)) {
        await chrome.alarms.clear(TICK_ALARM);
        return;
      }
      const { segments, next } = tickAll(sessions, Date.now());
      await setSessions(next);
      for (const seg of segments) await accrue(seg);
      await refreshRules();
    })();
  } else if (alarm.name === ROLL_ALARM) {
    void (async () => {
      await refreshRules();
      await scheduleDayRoll();
    })();
  } else if (alarm.name.startsWith(PASS_EXPIRE_PREFIX)) {
    // One-shot: the pass session lapsed; re-sync rules so the site re-blocks.
    // The alarm auto-expires; nothing to reschedule.
    void refreshRules();
  }
});

// --- settings changes -------------------------------------------------------------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // Chrome dedupes writes: setting a key to its existing value fires no
  // event, so watch every key that can change the desired rule set.
  if (changes[SETTINGS_KEY] || changes[STATE_KEY]) {
    void refreshRules();
    if (changes[SETTINGS_KEY]) void scheduleDayRoll();
  }
});

// --- messages from the interstitial page ---------------------------------------------

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) return;
  const msg = message as { type: string; domain?: string };

  if (msg.type === 'nextQuote') {
    void (async () => {
      const quote = await withStorageLock(async () => {
        const deck = await loadDeck(chromeKV);
        const r = nextQuote(deck, QUOTES.length, Math.random);
        await saveDeck(chromeKV, r.deck);
        return QUOTES[r.index];
      });
      sendResponse(quote);
    })();
    return true;
  }

  if (msg.type === 'siteStatus' && msg.domain) {
    void (async () => {
      const domain = msg.domain!;
      const { settings, state, now } = await loadUsageSnapshot();
      const site = settings.sites.find((s) => s.domain === domain);
      if (!site) {
        sendResponse({ known: false });
        return;
      }
      const active = isPassActive(state, domain, now);
      sendResponse({
        known: true,
        exhausted: isSiteExhausted(domain, state, settings, now),
        passesTotal: site.passes,
        passesUsed: state.passesUsed[domain] ?? 0,
        passesActive: active,
        passExpiresAt: active ? state.passesUntil[domain] : null,
      });
    })();
    return true;
  }

  if (msg.type === 'spendPass' && msg.domain) {
    void (async () => {
      const domain = msg.domain!;
      const spend = await withStorageLock(async () => {
        const now = Date.now();
        const settings = await loadSettings(chromeKV);
        const state = await loadState(chromeKV, settings, now);
        if (!settings.sites.some((s) => s.domain === domain)) return { ok: false, reason: 'unknown-site' } as const;

        const result = applyPassSpend(state, settings, domain, now);
        if (result.ok && !result.reused) {
          await saveState(chromeKV, result.state);
          await recordOverride(chromeKV, settings, domain, now);
        }
        return result;
      });
      if (!spend.ok) {
        sendResponse({ ok: false, reason: spend.reason });
        return;
      }
      if (!spend.reused) await refreshRules();
      sendResponse({ ok: true, url: `https://${domain}`, expiresAt: spend.expiresAt });
    })();
    return true;
  }

  return undefined;
});

// --- lifecycle ------------------------------------------------------------------------

/**
 * Rebuild the counted session map from live browser state: every visible
 * window's active blocked tab counts. Storage only supplies continuity
 * anchors for sessions that were already open when the worker died (same
 * window, tab and domain), anchored at the last alive timestamp. Used by
 * init() on worker wake and by the idle `active` transition on return.
 */
async function retrackAllVisibleWindows(): Promise<void> {
  const stored = await loadSessions(chromeKV);
  const now = Date.now();
  const next: SessionMap = {};
  minimizedWindows.clear();
  // No windowTypes filter: popups and extra windows are visible too.
  const wins = await chrome.windows.getAll();
  for (const w of wins) {
    if (w.id == null) continue;
    if (w.state === 'minimized') {
      minimizedWindows.add(w.id);
      continue;
    }
    try {
      const [tab] = await chrome.tabs.query({ windowId: w.id, active: true });
      const domain = await blockedDomainForUrl(tab?.url);
      if (!domain || tab?.id == null) continue;
      const prev = stored?.sessions[String(w.id)];
      const anchor =
        prev && prev.tabId === tab.id && prev.domain === domain
          ? Math.min(now, Math.max(prev.sinceMs, stored!.savedAt))
          : now;
      next[String(w.id)] = { windowId: w.id, tabId: tab.id, domain, sinceMs: anchor };
    } catch {
      /* window vanished mid-enumeration */
    }
  }
  await setSessions(next);
  await manageTickAlarm();
}

async function init(): Promise<void> {
  chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
  // Idle design D3: MV3 loses onStateChanged events while the worker is
  // dead, so always query the CURRENT state (audio-aware, D5) before
  // tracking. When the user is away, restored sessions are charged only up
  // to the last moment the worker could see them active, no sessions start,
  // and the later return re-enumerates normally.
  const away = await awayNow();
  awayKnown = away;
  if (away) {
    const stored = await loadSessions(chromeKV);
    for (const seg of awayChargePlan(stored ?? null, Date.now())) await accrue(seg);
    await setSessions({});
    await manageTickAlarm();
  } else {
    await retrackAllVisibleWindows();
  }
  await refreshRules();
  await scheduleDayRoll();
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshRules();
  void scheduleDayRoll();
});

chrome.runtime.onStartup.addListener(() => {
  void init().catch((err) => console.error('startup init failed', err));
});

/**
 * Resolves once the worker has (re)built the live session map. Every event
 * and alarm handler awaits this, so nobody ever acts on the empty map that
 * exists at the instant a dormant worker wakes up.
 */
const ready = init().catch((err) => console.error('init failed', err));
