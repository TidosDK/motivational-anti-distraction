import { nextReset } from './dayMath';
import type { DayState, Settings } from './types';

/** When a pass spent at `now` lapses: end of session, capped at the reset. */
export function passExpiryTime(now: number, settings: Settings): number {
  return Math.min(now + settings.passSessionMin * 60_000, nextReset(now, settings.resetHour));
}

export type SpendResult =
  | { ok: true; state: DayState; expiresAt: number; reused: boolean }
  | { ok: false; reason: 'no-passes-left' };

/**
 * Spend a day-pass on `domain`, opening a timed session. Pure (returns a new
 * state) so the spend math and no-double-spend rule are unit-testable. While a
 * session is still active the spend is a no-op that reuses it and does NOT
 * consume a second pass.
 */
export function applyPassSpend(
  state: DayState,
  settings: Settings,
  domain: string,
  now: number,
): SpendResult {
  const site = settings.sites.find((s) => s.domain === domain);
  if (!site) return { ok: false, reason: 'no-passes-left' };

  if (isPassActive(state, domain, now)) {
    return { ok: true, state, expiresAt: state.passesUntil[domain], reused: true };
  }
  const used = state.passesUsed[domain] ?? 0;
  if (used >= site.passes) return { ok: false, reason: 'no-passes-left' };

  const expiresAt = passExpiryTime(now, settings);
  return {
    ok: true,
    expiresAt,
    reused: false,
    state: {
      ...state,
      passesUntil: { ...state.passesUntil, [domain]: expiresAt },
      passesUsed: { ...state.passesUsed, [domain]: used + 1 },
    },
  };
}

/** Seconds on the combined meter: every blocked site's usage, counted once. */
export function combinedTotalSeconds(state: DayState): number {
  return Object.values(state.perSiteSeconds).reduce((a, b) => a + b, 0);
}

/** True while a spent day-pass session still exempts `domain`. */
export function isPassActive(state: DayState, domain: string, now: number): boolean {
  return (state.passesUntil[domain] ?? 0) > now;
}

/**
 * A site is exhausted (must be blocked) when it is configured, has no
 * *unexpired* day-pass session, and either its own limit or the combined
 * budget is used up. Usage during an active pass still counts toward the
 * combined total (it shows in the stats), but never re-blocks the exempted
 * site itself. Expiry is lazy: an elapsed `passesUntil` simply stops
 * exempting, with no alarm required for correctness.
 */
export function isSiteExhausted(
  domain: string,
  state: DayState,
  settings: Settings,
  now: number,
): boolean {
  if (isPassActive(state, domain, now)) return false;
  const site = settings.sites.find((s) => s.domain === domain);
  if (!site) return false;
  const used = state.perSiteSeconds[domain] ?? 0;
  if (site.limitMin != null && used >= site.limitMin * 60) return true;
  return combinedTotalSeconds(state) >= settings.combinedBudgetMin * 60;
}
