import { nextReset } from '../shared/dayMath';
import { domainMatches, hostFromUrl } from '../shared/domains';
import { chromeKV, accrueForeground, loadActiveSession, loadDeck, loadSettings, loadState, recordOverride, saveActiveSession, saveDeck, saveState } from '../shared/storage';
import { SETTINGS_KEY, STATE_KEY } from '../shared/types';
import { QUOTES } from '../shared/quotes';
import { nextQuote } from '../shared/deck';
import { closeSession, switchFocus, tickSession, type ActiveSession, type Segment } from './accounting';
import { computeBlockedDomains, diffRules, regexFilterFor, type RuleSpec } from './enforcement';
import { applyPassSpend, isPassActive, isSiteExhausted } from '../shared/exhaustion';

const TICK_ALARM = 'usage-tick';
const ROLL_ALARM = 'day-roll';
/** One-shot alarms: `pass-expire:<domain>` refreshes rules when a session lapses. */
const PASS_EXPIRE_PREFIX = 'pass-expire:';

/** The foreground tab session of the focused window (null = nothing counted). */
let active: ActiveSession | null = null;
let focusedWindowId: number = chrome.windows.WINDOW_ID_NONE;
let focusEventSeen = false;

async function setActive(next: ActiveSession | null): Promise<void> {
  active = next;
  await saveActiveSession(chromeKV, next, Date.now());
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
  if (active) chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
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

/** Point the tracked session at (tabId, url) of the focused window. */
async function focusTab(windowId: number, tabId: number, url: string | undefined): Promise<void> {
  const domain = await blockedDomainForUrl(url);
  const r = switchFocus(active, domain, tabId, windowId, Date.now());
  await setActive(r.next);
  const accrued = r.closed != null;
  await accrue(r.closed);
  await manageTickAlarm();
  // Only re-derive rules when usage actually changed; skipping the no-op path
  // keeps the day-roll alarm the sole promptness mechanism at day boundaries.
  if (accrued) await refreshRules();
}

async function focusActiveTabOf(windowId: number): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ windowId, active: true });
    await focusTab(windowId, tab?.id ?? -1, tab?.url);
  } catch {
    /* window vanished */
  }
}

// --- focus / tab events -------------------------------------------------------

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  focusEventSeen = true;
  if (focusedWindowId !== chrome.windows.WINDOW_ID_NONE && windowId !== focusedWindowId) return;
  void chrome.tabs.get(tabId).then((tab) => focusTab(windowId, tabId, tab.url)).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  focusEventSeen = true;
  if (!tab.active) return;
  if (focusedWindowId !== chrome.windows.WINDOW_ID_NONE && tab.windowId !== focusedWindowId) return;
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
    void focusTab(tab.windowId, tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (active?.tabId === tabId) {
    const closed = closeSession(active, Date.now());
    void setActive(null).then(() => accrue(closed)).then(manageTickAlarm);
  } else if (removeInfo.windowId === focusedWindowId && !removeInfo.isWindowClosing) {
    void focusActiveTabOf(removeInfo.windowId);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  focusEventSeen = true;
  focusedWindowId = windowId;
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    const closed = closeSession(active, Date.now());
    void setActive(null).then(() => accrue(closed)).then(manageTickAlarm);
  } else {
    void focusActiveTabOf(windowId);
  }
});

// --- alarms --------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) {
    void (async () => {
      if (!active) {
        await chrome.alarms.clear(TICK_ALARM);
        return;
      }
      const { accrued, next } = tickSession(active, Date.now());
      await setActive(next);
      await accrue(accrued);
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
  try {
    const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (w?.id != null && !focusEventSeen) focusedWindowId = w.id;
  } catch {
    /* no windows yet */
  }
  const restored = await loadActiveSession(chromeKV);
  // Don't clobber sessions that live events already established while init ran.
  if (restored?.session && !focusEventSeen) {
    // The worker died with a session open; events fired after this point close
    // it accurately, so re-anchor the start at the last known-alive timestamp.
    active = { ...restored.session, sinceMs: Math.max(restored.session.sinceMs, restored.savedAt) };
  }
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
