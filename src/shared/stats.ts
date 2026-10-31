import { dayKey, nextReset, usageDayStart } from './dayMath';
import type { DayRecord, DayState, History, OverrideEntry, Settings } from './types';

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
