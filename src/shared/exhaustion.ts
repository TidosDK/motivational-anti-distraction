import type { DayState, Settings } from './types';

/** Seconds on the combined meter: every blocked site's usage, counted once. */
export function combinedTotalSeconds(state: DayState): number {
  return Object.values(state.perSiteSeconds).reduce((a, b) => a + b, 0);
}

/**
 * A site is exhausted (must be blocked) when it is configured, has no active
 * day-pass, and either its own limit or the combined budget is used up.
 * Usage under an active pass still counts toward the combined total (it shows
 * in the stats), but never re-blocks the exempted site itself.
 */
export function isSiteExhausted(
  domain: string,
  state: DayState,
  settings: Settings,
): boolean {
  if (state.passesActive[domain]) return false;
  const site = settings.sites.find((s) => s.domain === domain);
  if (!site) return false;
  const used = state.perSiteSeconds[domain] ?? 0;
  if (site.limitMin != null && used >= site.limitMin * 60) return true;
  return combinedTotalSeconds(state) >= settings.combinedBudgetMin * 60;
}
