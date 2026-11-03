import { nextReset } from '../shared/dayMath';
import { domainMatches, hostFromUrl } from '../shared/domains';
import { chromeKV, accrueForeground, loadDeck, loadSessions, loadSettings, loadState, recordOverride, saveDeck, saveSessions, saveState } from '../shared/storage';
import { SETTINGS_KEY, STATE_KEY } from '../shared/types';
import { QUOTES } from '../shared/quotes';
import { nextQuote } from '../shared/deck';
import { closeWindowSession, hasAnySession, setWindowSession, tickAll, type Segment, type SessionMap } from './accounting';
import { computeBlockedDomains, diffRules, regexFilterFor, type RuleSpec } from './enforcement';
import { applyPassSpend, isPassActive, isSiteExhausted } from '../shared/exhaustion';

const TICK_ALARM = 'usage-tick';
const ROLL_ALARM = 'day-roll';
/** One-shot alarms: `pass-expire:<domain>` refreshes rules when a session lapses. */
const PASS_EXPIRE_PREFIX = 'pass-expire:';

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
  const settings = await loadSettings(chromeKV);
  await accrueForeground(chromeKV, seg.domain, seg.fromMs, seg.toMs, settings);
}

function interstitialUrl(domain: string): string {
  return chrome.runtime.getURL(`/interstitial.html?s=${encodeURIComponent(domain)}`);
}

async function refreshRulesNow(): Promise<void> {
  const settings = await loadSettings(chromeKV);
  const state = await loadState(chromeKV, settings, Date.now());
  const desired: RuleSpec[] = computeBlockedDomains(settings, state, Date.now()).map((domain, i) => ({
    id: i + 1,
    domain,
    redirectUrl: interstitialUrl(domain),
  }));
  const existing = (await chrome.declarativeNetRequest.getDynamicRules()).map((r) => ({
    id: r.id,
    redirectUrl: r.action.redirect?.regexSubstitution ?? r.action.redirect?.url ?? '',
  }));
  const { add, removeIds } = diffRules(desired, existing);
  if (add.length === 0 && removeIds.length === 0) return;
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

/**
 * Serialized rule sync. Triggers (accruals, storage events, alarms) can
 * overlap; running diffs concurrently could double-remove a rule id and
 * throw, so refreshes queue instead.
 */
let refreshChain: Promise<void> = Promise.resolve();
function refreshRules(): Promise<void> {
  const run = refreshChain.then(refreshRulesNow, refreshRulesNow);
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
  // Only re-derive rules when usage actually changed; skipping the no-op path
  // keeps the day-roll alarm the sole promptness mechanism at day boundaries.
  if (accrued) await refreshRules();
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

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void chrome.tabs.get(tabId).then((tab) => updateWindowTab(windowId, tabId, tab.url)).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active) return;
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
    void updateWindowTab(tab.windowId, tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  const cur = sessions[String(removeInfo.windowId)];
  if (cur?.tabId !== tabId) return; // a background tab closed; nothing tracked
  if (removeInfo.isWindowClosing) void dropWindow(removeInfo.windowId);
  else void trackActiveTabOf(removeInfo.windowId);
});

chrome.windows.onRemoved.addListener((windowId) => {
  minimizedWindows.delete(windowId);
  void dropWindow(windowId);
});

// Minimize/restore (also fires on resize/maximize — harmless re-anchoring).
// Chrome passes the full Window, whose `state` tells us about minimize.
chrome.windows.onBoundsChanged.addListener((window) => {
  const windowId = window.id;
  if (windowId == null) return;
  if (window.state === 'minimized') {
    minimizedWindows.add(windowId);
    void dropWindow(windowId);
  } else {
    minimizedWindows.delete(windowId);
    void trackActiveTabOf(windowId);
  }
});

// --- alarms --------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) {
    void (async () => {
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
      const settings = await loadSettings(chromeKV);
      await loadState(chromeKV, settings, Date.now()); // lazy-rolls if boundary passed
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
      const deck = await loadDeck(chromeKV);
      const r = nextQuote(deck, QUOTES.length, Math.random);
      await saveDeck(chromeKV, r.deck);
      sendResponse(QUOTES[r.index]);
    })();
    return true;
  }

  if (msg.type === 'siteStatus' && msg.domain) {
    void (async () => {
      const domain = msg.domain!;
      const now = Date.now();
      const settings = await loadSettings(chromeKV);
      const state = await loadState(chromeKV, settings, now);
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
      const now = Date.now();
      const settings = await loadSettings(chromeKV);
      const state = await loadState(chromeKV, settings, now);
      if (!settings.sites.some((s) => s.domain === domain)) {
        sendResponse({ ok: false, reason: 'unknown-site' });
        return;
      }
      const spend = applyPassSpend(state, settings, domain, now);
      if (!spend.ok) {
        sendResponse({ ok: false, reason: spend.reason });
        return;
      }
      if (!spend.reused) {
        await saveState(chromeKV, spend.state);
        await recordOverride(chromeKV, settings, domain, now);
        schedulePassExpiry(domain, spend.expiresAt);
        await refreshRules();
      }
      sendResponse({ ok: true, url: `https://${domain}`, expiresAt: spend.expiresAt });
    })();
    return true;
  }

  return undefined;
});

// --- lifecycle ------------------------------------------------------------------------

async function init(): Promise<void> {
  // Rebuild the session map from live browser state on every worker wake:
  // every visible window's active blocked tab counts. Storage only supplies
  // continuity anchors for sessions that were already open when the worker
  // died (same window, tab and domain), anchored at the last alive timestamp.
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
  await refreshRules();
  await scheduleDayRoll();
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshRules();
  void scheduleDayRoll();
});

chrome.runtime.onStartup.addListener(() => {
  void init();
});

init().catch((err) => console.error('init failed', err));
