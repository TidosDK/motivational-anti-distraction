import { dayKey, nextReset, usageDayStart } from './dayMath';
import { combinedTotalSeconds } from './exhaustion';
import type { DayRecord, DayState, History, OverrideEntry, Settings, SiteSetting } from './types';

export interface SiteUsageRow {
  domain: string;
  usedSec: number;
  limitMin: number | null;
  /** 0-1 (can exceed 1 is clamped); null when there is no per-site limit. */
  fraction: number | null;
  passesUsed: number;
  passesTotal: number;
  passActive: boolean;
}

export interface StatsView {
  today: {
    dayStartLabel: string;
    resetsAtLabel: string;
    sites: SiteUsageRow[];
    combinedUsedSec: number;
    combinedBudgetMin: number;
    combinedFraction: number;
    overrides: OverrideEntry[];
  };
  /** Recent closed days, newest first. */
  history: Array<{ key: string; record: DayRecord }>;
}

const fmtClock = (ts: number): string =>
  new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** "1h 23m" / "45m" / "30s" — whole units, no decimals. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/**
 * Pure projection of storage into what the stats page shows. Today comes
 * from `state` (attributed to the current usage day); history is every
 * closed day, newest first.
 */
export function buildStatsView(
  settings: Settings,
  state: DayState,
  history: History,
  now: number,
): StatsView {
  const combinedUsedSec = Object.values(state.perSiteSeconds).reduce((a, b) => a + b, 0);

  const sites: SiteUsageRow[] = settings.sites.map((s) => {
    const usedSec = state.perSiteSeconds[s.domain] ?? 0;
    return {
      domain: s.domain,
      usedSec,
      limitMin: s.limitMin,
      fraction: s.limitMin ? Math.min(1, usedSec / (s.limitMin * 60)) : null,
      passesUsed: state.passesUsed[s.domain] ?? 0,
      passesTotal: s.passes,
      passActive: (state.passesUntil[s.domain] ?? 0) > now,
    };
  });

  // Sites used today but removed from the block list still show up.
  const known = new Set(settings.sites.map((s) => s.domain));
  for (const [domain, usedSec] of Object.entries(state.perSiteSeconds)) {
    if (!known.has(domain) && usedSec > 0) {
      sites.push({
        domain,
        usedSec,
        limitMin: null,
        fraction: null,
        passesUsed: state.passesUsed[domain] ?? 0,
        passesTotal: 0,
        passActive: false,
      });
    }
  }
  sites.sort((a, b) => a.domain.localeCompare(b.domain));

  // Overrides for the *current* day live in history[todayKey] already (they
  // are appended as they happen), so exclude that in-progress record from the
  // "closed days" list and surface its overrides under Today instead.
  const todayKey = dayKey(usageDayStart(now, settings.resetHour));
  const historyDays = Object.entries(history)
    .filter(([key]) => key !== todayKey)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, record]) => ({ key, record }));

  const todayOverrides: OverrideEntry[] = [...(history[todayKey]?.overrides ?? [])];

  return {
    today: {
      dayStartLabel: fmtClock(state.dayStart),
      resetsAtLabel: fmtClock(nextReset(now, settings.resetHour)),
      sites,
      combinedUsedSec,
      combinedBudgetMin: settings.combinedBudgetMin,
      combinedFraction: Math.min(1, combinedUsedSec / (settings.combinedBudgetMin * 60)),
      overrides: todayOverrides.sort((a, b) => b.ts - a.ts),
    },
    history: historyDays,
  };
}

export interface PopupSiteRow {
  domain: string;
  usedSec: number;
  limitMin: number | null;
  /** Time left against the per-site limit; null = no per-site limit. Never < 0. */
  remainingSec: number | null;
  /** 0-1 clamped; null when there is no per-site limit. */
  fraction: number | null;
}

export interface PopupView {
  sites: PopupSiteRow[];
  combinedUsedSec: number;
  combinedBudgetMin: number;
  /** Combined budget time left; never < 0. */
  combinedRemainingSec: number;
  combinedFraction: number;
  /** Epoch ms of the next usage-day reset. */
  resetsAt: number;
}

function remainingSeconds(limitMin: number, usedSec: number): number {
  return Math.max(0, limitMin * 60 - usedSec);
}

/** Compact remaining time, limited by both budgets when the tab has a site limit. */
export function computeBadgeStatus(
  settings: Settings,
  state: DayState | undefined,
  now: number,
  site?: SiteSetting,
): { badgeText: string; overBudget: boolean } {
  if (settings.sites.length === 0) return { badgeText: '', overBudget: false };

  const today = state?.dayStart === usageDayStart(now, settings.resetHour) ? state : undefined;
  let remainingSec = remainingSeconds(settings.combinedBudgetMin, today ? combinedTotalSeconds(today) : 0);
  if (site?.limitMin != null) {
    const siteUsedSec = today?.perSiteSeconds[site.domain] ?? 0;
    remainingSec = Math.min(remainingSec, remainingSeconds(site.limitMin, siteUsedSec));
  }
  if (remainingSec === 0) return { badgeText: '0', overBudget: true };

  // Show whole minutes remaining and reserve zero for an exhausted budget.
  const minutes = Math.max(1, Math.floor(remainingSec / 60));
  if (minutes <= 99) return { badgeText: String(minutes), overBudget: false };
  if (minutes >= 600) return { badgeText: '9h+', overBudget: false };

  const hours = Math.floor(minutes / 60);
  return { badgeText: `${hours}h`, overBudget: false };
}

/**
 * Pure projection for the toolbar popup: remaining time per blocked site and
 * for the combined budget. Sites without a per-site limit carry `null`
 * remaining (only the combined budget governs them). Domains used today but
 * since removed from the list still appear, like in the stats view.
 */
export function buildPopupView(settings: Settings, state: DayState, now: number): PopupView {
  const row = (domain: string, usedSec: number, limitMin: number | null): PopupSiteRow => ({
    domain,
    usedSec,
    limitMin,
    remainingSec: limitMin != null ? remainingSeconds(limitMin, usedSec) : null,
    fraction: limitMin ? Math.min(1, usedSec / (limitMin * 60)) : null,
  });

  const sites: PopupSiteRow[] = settings.sites.map((s) =>
    row(s.domain, state.perSiteSeconds[s.domain] ?? 0, s.limitMin),
  );

  // Sites used today but removed from the block list still show up.
  const known = new Set(settings.sites.map((s) => s.domain));
  for (const [domain, usedSec] of Object.entries(state.perSiteSeconds)) {
    if (!known.has(domain) && usedSec > 0) sites.push(row(domain, usedSec, null));
  }
  sites.sort((a, b) => a.domain.localeCompare(b.domain));

  const combinedUsedSec = combinedTotalSeconds(state);
  const combinedBudgetSec = settings.combinedBudgetMin * 60;

  return {
    sites,
    combinedUsedSec,
    combinedBudgetMin: settings.combinedBudgetMin,
    combinedRemainingSec: remainingSeconds(settings.combinedBudgetMin, combinedUsedSec),
    combinedFraction: Math.min(1, combinedUsedSec / combinedBudgetSec),
    resetsAt: nextReset(now, settings.resetHour),
  };
}
