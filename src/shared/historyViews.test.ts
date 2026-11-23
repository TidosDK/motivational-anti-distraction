import { describe, expect, it } from 'vitest';
import { dayKey, usageDayStart } from './dayMath';
import { buildHistoryViews, buildStatsView } from './stats';
import { freshState } from './storage';
import { DEFAULT_SETTINGS, type DayRecord, type History } from './types';

const now = new Date(2026, 10, 15, 14).getTime();
const today = freshState(usageDayStart(now, 5));
const settings = {
  ...DEFAULT_SETTINGS,
  sites: [{ domain: 'example.com', limitMin: 60, passes: 1 }],
};

function record(minutes: number): DayRecord {
  return { perSite: { 'example.com': minutes * 60 }, totalSec: minutes * 60, overrides: [] };
}

describe('buildHistoryViews', () => {
  it('counts unrecorded days between records and re-scores against current limits', () => {
    const history: History = {
      '2026-11-10': record(10), '2026-11-11': record(0),
      '2026-11-13': record(61), '2026-11-14': record(25),
    };
    const state = { ...today, perSiteSeconds: { 'example.com': 20 * 60 } };
    const view = buildHistoryViews(history, settings, state, now);
    expect(view.streaks).toEqual({ current: 2, best: 3 });
    expect(view.days.map(({ minutes }) => minutes)).toEqual([10, 0, 0, 61, 25, 20]);
    expect(view.days[2].perSite).toEqual({});
    expect(view.days[3].budget).toEqual({ combinedExceeded: false, exceededSites: ['example.com'] });
    expect(buildStatsView(settings, state, history, now).history[1].budget).toEqual(view.days[3].budget);

    const raised = { ...settings, sites: [{ ...settings.sites[0], limitMin: 70 }] };
    expect(buildHistoryViews(history, raised, state, now).streaks).toEqual({ current: 6, best: 6 });
    expect(buildHistoryViews(history, { ...raised, combinedBudgetMin: 15 }, state, now).streaks)
      .toEqual({ current: 0, best: 3 });
  });

  it('assigns distinct intensity buckets and counts exact-limit days as within budget', () => {
    const history: History = Object.fromEntries([0, 15, 30, 45, 60, 60.01].map((minutes, i) =>
      [`2026-11-${String(i + 9).padStart(2, '0')}`, record(minutes)],
    ));
    const view = buildHistoryViews(history, { ...settings, combinedBudgetMin: 60 }, today, now);
    expect(view.days.map(({ bucket }) => bucket)).toEqual([0, 1, 2, 3, 4, 5, 0]);
    expect(view.days[4].budget).toEqual({ combinedExceeded: false, exceededSites: [] });
    expect(view.days[5].budget).toEqual({ combinedExceeded: true, exceededSites: ['example.com'] });
    expect(view.streaks).toEqual({ current: 1, best: 5 });
  });

  it('counts stored and live usage together and counts each override once', () => {
    const history: History = {
      '2026-11-14': record(3),
      '2026-11-15': { ...record(2), overrides: [{ site: 'example.com', ts: now, affirmed: true }] },
    };
    const state = { ...today, perSiteSeconds: { 'example.com': 91.25 } };
    const view = buildHistoryViews(history, settings, state, now);
    expect(view.days[1].minutes).toBe(211.25 / 60);
    expect(view.days[1].perSite).toEqual({ 'example.com': 211.25 });
    expect(view.totals).toEqual({
      trackedSec: 391.25, overrideCount: 1, firstDay: '2026-11-14', lastDay: '2026-11-15', dayCount: 2,
    });
  });

  it('keeps install age separate from the retained 370-day window', () => {
    const old = new Date(2025, 10, 15 - 4, 5).getTime();
    const install = new Date(2024, 10, 15, 5).getTime();
    const view = buildHistoryViews({ [dayKey(old)]: record(8) }, settings, today, now, install);
    expect(view.totals).toEqual({
      trackedSec: 480, overrideCount: 0, firstDay: dayKey(old), lastDay: '2026-11-15', dayCount: 370,
    });
    expect(view.days).toHaveLength(370);
    expect(view.streaks).toEqual({ current: 370, best: 370 });
    expect(view.daysSinceInstall).toBe(730);
  });

  it('starts at the first day with a record and leaves an unused install empty', () => {
    const install = new Date(2026, 10, 10, 5).getTime();
    const empty = buildHistoryViews({}, settings, today, now, install);
    expect(empty.days).toEqual([]);
    expect(empty.streaks).toEqual({ current: 0, best: 0 });
    expect(empty.totals).toMatchObject({ trackedSec: 0, firstDay: null, dayCount: 0 });
    expect(empty.daysSinceInstall).toBe(5);

    const state = { ...today, perSiteSeconds: { 'example.com': 60 } };
    const first = buildHistoryViews({}, settings, state, now, install);
    expect(first.days).toEqual([{
      key: '2026-11-15', minutes: 1, perSite: { 'example.com': 60 }, bucket: 1,
      budget: { combinedExceeded: false, exceededSites: [] },
    }]);
    expect(first.streaks).toEqual({ current: 1, best: 1 });
  });
});
