import { domainMatches, hostFromUrl } from '../shared/domains';
import { computeBadgeStatus } from '../shared/stats';
import type { DayState, Settings, SiteSetting } from '../shared/types';

const ICON_SIZES = [16, 32, 48, 128];

function siteForTab(url: string | undefined, settings: Settings, interstitial: string): SiteSetting | undefined {
  if (!url) return undefined;
  if (url.startsWith(`${interstitial}?`)) {
    const domain = new URL(url).searchParams.get('s');
    return settings.sites.find((site) => site.domain === domain);
  }

  const host = hostFromUrl(url);
  return host ? settings.sites.find((site) => domainMatches(host, site.domain)) : undefined;
}

async function setActionStatus(
  { badgeText, overBudget }: ReturnType<typeof computeBadgeStatus>,
  tabId?: number,
): Promise<void> {
  const suffix = overBudget ? '-red' : '';
  const path = Object.fromEntries(ICON_SIZES.map((size) => [size, `icons/icon-${size}${suffix}.png`]));
  const target = tabId === undefined ? {} : { tabId };

  await chrome.action.setIcon({ ...target, path });
  await chrome.action.setBadgeBackgroundColor({ ...target, color: badgeText ? '#b32124' : [0, 0, 0, 0] });
  await chrome.action.setBadgeText({ ...target, text: badgeText });
}

export async function updateActionStatus(settings: Settings, state: DayState | undefined, now: number): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true });
  const interstitial = chrome.runtime.getURL('interstitial.html');
  const updates = [setActionStatus(computeBadgeStatus(settings, state, now))];

  // The action API scopes overrides to a tab, so each window can show its own budget.
  for (const tab of tabs) {
    if (tab.id == null) continue;
    const site = siteForTab(tab.url, settings, interstitial);
    updates.push(setActionStatus(computeBadgeStatus(settings, state, now, site), tab.id));
  }

  // A tab may close during a refresh. Wait for the remaining updates before the next snapshot.
  for (const update of await Promise.allSettled(updates)) {
    if (update.status === 'rejected') console.error('toolbar status update failed', update.reason);
  }
}
