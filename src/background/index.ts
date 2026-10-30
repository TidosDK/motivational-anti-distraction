import { nextReset } from '../shared/dayMath';
import { domainMatches, hostFromUrl } from '../shared/domains';
import { chromeKV, accrueForeground, loadActiveSession, loadDeck, loadSettings, loadState, recordOverride, saveActiveSession, saveDeck, saveState } from '../shared/storage';
import { QUOTES } from '../shared/quotes';
import { nextQuote } from '../shared/deck';
import { closeSession, switchFocus, tickSession, type ActiveSession, type Segment } from './accounting';
import { computeBlockedDomains, diffRules, regexFilterFor, type RuleSpec } from './enforcement';

const TICK_ALARM = 'usage-tick';
const ROLL_ALARM = 'day-roll';

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

async function refreshRules(): Promise<void> {
  const settings = await loadSettings(chromeKV);
  const state = await loadState(chromeKV, settings, Date.now());
  const desired: RuleSpec[] = computeBlockedDomains(settings, state).map((domain, i) => ({
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

async function manageTickAlarm(): Promise<void> {
  if (active) chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  else await chrome.alarms.clear(TICK_ALARM);
}

async function scheduleDayRoll(): Promise<void> {
  const settings = await loadSettings(chromeKV);
  chrome.alarms.create(ROLL_ALARM, { when: nextReset(Date.now(), settings.resetHour) + 250 });
}

/** Point the tracked session at (tabId, url) of the focused window. */
async function focusTab(windowId: number, tabId: number, url: string | undefined): Promise<void> {
  const domain = await blockedDomainForUrl(url);
  const r = switchFocus(active, domain, tabId, windowId, Date.now());
  await setActive(r.next);
  await accrue(r.closed);
  await manageTickAlarm();
  await refreshRules();
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
  }
});

// --- settings changes -------------------------------------------------------------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    void refreshRules();
    void scheduleDayRoll();
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
      const settings = await loadSettings(chromeKV);
      const state = await loadState(chromeKV, settings, Date.now());
      const site = settings.sites.find((s) => s.domain === domain);
      if (!site) {
        sendResponse({ known: false });
        return;
      }
      const combined = Object.values(state.perSiteSeconds).reduce((a, b) => a + b, 0);
      sendResponse({
        known: true,
        exhausted:
          !state.passesActive[domain] &&
          ((site.limitMin != null && (state.perSiteSeconds[domain] ?? 0) >= site.limitMin * 60) ||
            combined >= settings.combinedBudgetMin * 60),
        passesTotal: site.passes,
        passesUsed: state.passesUsed[domain] ?? 0,
        passesActive: state.passesActive[domain] === true,
      });
    })();
    return true;
  }

  if (msg.type === 'spendPass' && msg.domain) {
    void (async () => {
      const domain = msg.domain!;
      const settings = await loadSettings(chromeKV);
      const state = await loadState(chromeKV, settings, Date.now());
      const site = settings.sites.find((s) => s.domain === domain);
      if (!site) {
        sendResponse({ ok: false, reason: 'unknown-site' });
        return;
      }
      if (state.passesActive[domain]) {
        sendResponse({ ok: true, url: `https://${domain}` });
        return;
      }
      const used = state.passesUsed[domain] ?? 0;
      if (used >= site.passes) {
        sendResponse({ ok: false, reason: 'no-passes-left' });
        return;
      }
      state.passesActive[domain] = true;
      state.passesUsed[domain] = used + 1;
      await saveState(chromeKV, state);
      await recordOverride(chromeKV, settings, domain, Date.now());
      await refreshRules();
      sendResponse({ ok: true, url: `https://${domain}` });
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
