import { describe, expect, it } from 'vitest';
import { dayKey, usageDayStart } from './dayMath';
import {
  accrueForeground,
  loadHistory,
  loadState,
  memoryKV,
  recordOverride,
  saveSettings,
} from './storage';
import { buildStatsView, formatDuration } from './stats';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from './types';
import type { Settings } from './types';

const MIN = 60_000;

const settings = (over: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  version: SCHEMA_VERSION,
  sites: [
    { domain: 'youtube.com', limitMin: 60, passes: 1 },
    { domain: 'instagram.com', limitMin: 30, passes: 2 },
  ],
  combinedBudgetMin: 120,
  resetHour: 5,
  ...over,
});

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [45, '45s'],
    [60, '1m'],
    [90, '1m'],
    [59 * 60 + 30, '59m'],
    [3600, '1h 0m'],
    [5030, '1h 23m'],
  ])('%is → %s', (sec, out) => expect(formatDuration(sec)).toBe(out));
});

describe('buildStatsView', () => {
  it('renders today from live state: per-site meters, limits, passes, combined', async () => {
    const kv = memoryKV();
    const s = settings();
    await saveSettings(kv, s);
    // "now" mid-evening so the usage day started at 05:00 the same date.
    const now = new Date(2026, 9, 30, 20, 0, 0).getTime();

    await accrueForeground(kv, 'youtube.com', now - 80 * MIN, now, s);
    await accrueForeground(kv, 'instagram.com', now - 31 * MIN, now, s);
    await recordOverride(kv, s, 'youtube.com', now - 5 * MIN);

    const state = await loadState(kv, s, now);
    const history = await loadHistory(kv);
    const view = buildStatsView(s, state, history, now);

    expect(view.today.sites.map((r) => r.domain)).toEqual(['instagram.com', 'youtube.com']);
    const yt = view.today.sites.find((r) => r.domain === 'youtube.com')!;
    expect(yt.usedSec).toBeCloseTo(80 * 60, 0);
    expect(yt.limitMin).toBe(60);
    expect(yt.fraction).toBe(1); // clamped
    const ig = view.today.sites.find((r) => r.domain === 'instagram.com')!;
    expect(ig.fraction).toBe(1); // 31m of 30m limit, clamped

    expect(view.today.combinedUsedSec).toBeCloseTo(111 * 60, 0);
    expect(view.today.combinedBudgetMin).toBe(120);
    expect(view.today.combinedFraction).toBeCloseTo(111 / 120, 2);

    // Override recorded today shows under Today, not in closed history.
    expect(view.today.overrides).toHaveLength(1);
    expect(view.today.overrides[0].site).toBe('youtube.com');
    expect(view.today.overrides[0].affirmed).toBe(true);
    expect(view.history.find((d) => d.key === dayKey(usageDayStart(now, s.resetHour)))).toBeUndefined();
  });

  it('lists closed days newest-first with totals and override counts', async () => {
    const kv = memoryKV();
    const s = settings();
    await saveSettings(kv, s);
    const now = new Date(2026, 9, 30, 20, 0, 0).getTime();
    const yesterday = usageDayStart(now - 26 * MIN * 60, s.resetHour);
    const twoDaysAgo = usageDayStart(now - 50 * MIN * 60, s.resetHour);

    // Two closed days as fixtures, plus live usage + an override today.
    await kv.set({
      history: {
        [dayKey(twoDaysAgo)]: {
          perSite: { 'youtube.com': 45 * 60 },
          totalSec: 45 * 60,
          overrides: [],
        },
        [dayKey(yesterday)]: {
          perSite: { 'instagram.com': 20 * 60 },
          totalSec: 20 * 60,
          overrides: [{ site: 'instagram.com', ts: yesterday + 60_000, affirmed: true }],
        },
      },
    });
    await accrueForeground(kv, 'instagram.com', now - 40 * MIN, now, s);
    await recordOverride(kv, s, 'youtube.com', now - 3 * MIN);

    const state = await loadState(kv, s, now);
    const history = await loadHistory(kv);
    const view = buildStatsView(s, state, history, now);

    expect(view.history.map((d) => d.key)).toEqual([dayKey(yesterday), dayKey(twoDaysAgo)]);
    expect(view.history[0].record.overrides[0].site).toBe('instagram.com');
    expect(view.history[1].record.totalSec).toBe(45 * 60);
    // Today's single override is under Today, not a history row.
    expect(view.today.overrides.map((o) => o.site)).toEqual(['youtube.com']);
  });

  it('shows sites that were used today even after being removed from the block list', async () => {
    const kv = memoryKV();
    const s = settings();
    await saveSettings(kv, s);
    const now = new Date(2026, 9, 30, 20, 0, 0).getTime();
    await accrueForeground(kv, 'reddit.com', now - 10 * MIN, now, s);

    const removed = settings({ sites: [{ domain: 'youtube.com', limitMin: 60, passes: 1 }] });
    const state = await loadState(kv, removed, now);
    const view = buildStatsView(removed, state, await loadHistory(kv), now);
    expect(view.today.sites.map((r) => r.domain)).toContain('reddit.com');
    expect(view.today.sites.find((r) => r.domain === 'reddit.com')!.limitMin).toBeNull();
  });

  it('empty install renders empty rows without crashing', async () => {
    const kv = memoryKV();
    const s = settings({ sites: [] });
    await saveSettings(kv, s);
    const now = Date.now();
    const state = await loadState(kv, s, now);
    const view = buildStatsView(s, state, await loadHistory(kv), now);
    expect(view.today.sites).toEqual([]);
    expect(view.history).toEqual([]);
    expect(view.today.overrides).toEqual([]);
    expect(view.today.combinedUsedSec).toBe(0);
  });
});
