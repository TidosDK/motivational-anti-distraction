import { describe, expect, it } from 'vitest';
import { usageDayStart } from './dayMath';
import {
  accrueForeground,
  emptyRecord,
  loadHistory,
  loadSettings,
  loadState,
  memoryKV,
  pruneHistory,
  recordOverride,
  saveState,
} from './storage';
import { DEFAULT_SETTINGS, HISTORY_KEY, type DayState, type History, type Settings } from './types';

const H = 60 * 60 * 1000;
const day = (date: number, hour = 12) => new Date(2026, 9, date, hour, 0, 0, 0).getTime();
const RESET = 5;
const settings: Settings = { ...DEFAULT_SETTINGS, resetHour: RESET };
const startOf = (date: number) => usageDayStart(day(date), RESET);

describe('loadSettings', () => {
  it('returns defaults on a fresh install', async () => {
    const kv = memoryKV();
    expect(await loadSettings(kv)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('loadState (lazy day-roll)', () => {
  it('fixes the night-owl case: 01:00 on the 15th belongs to the day starting the 14th', async () => {
    const kv = memoryKV();
    const state = await loadState(kv, settings, day(15, 1));
    expect(state.dayStart).toBe(new Date(2026, 9, 14, RESET, 0, 0, 0).getTime());
  });

  it('rolls a stale day into history and resets all counters', async () => {
    const stale: DayState = {
      version: 1,
      dayStart: startOf(14),
      perSiteSeconds: { 'youtube.com': 3600 },
      passesUntil: { 'youtube.com': day(15, 11) },
      passesUsed: { 'youtube.com': 1 },
    };
    const kv = memoryKV({ state: stale });
    const state = await loadState(kv, settings, day(15, 12));
    expect(state.dayStart).toBe(startOf(15));
    expect(state.perSiteSeconds).toEqual({});
    expect(state.passesUntil).toEqual({});
    expect(state.passesUsed).toEqual({});

    const history = await loadHistory(kv);
    const closed = history['2026-10-14'];
    expect(closed.perSite['youtube.com']).toBe(3600);
    expect(closed.totalSec).toBe(3600);
  });

  it('migrates a pre-timed passesActive state (treats old passes as expired)', async () => {
    const legacy = {
      version: 1,
      dayStart: startOf(15),
      perSiteSeconds: { 'youtube.com': 60 },
      passesActive: { 'youtube.com': true }, // old shape
      passesUsed: { 'youtube.com': 1 },
    };
    const kv = memoryKV({ state: legacy });
    const state = await loadState(kv, settings, day(15, 12));
    expect(state.passesUntil).toEqual({}); // old active pass is gone, not carried over
    expect((state as unknown as Record<string, unknown>).passesActive).toBeUndefined();
  });

  it('keeps overrides recorded during the day when the day closes', async () => {
    const stale: DayState = {
      version: 1,
      dayStart: startOf(14),
      perSiteSeconds: { 'youtube.com': 60 },
      passesUntil: {},
      passesUsed: {},
    };
    const history: History = {
      '2026-10-14': { ...emptyRecord(), overrides: [{ site: 'youtube.com', ts: day(14, 9), affirmed: true }] },
    };
    const kv = memoryKV({ state: stale, [HISTORY_KEY]: history });
    await loadState(kv, settings, day(15, 12));
    const closed = (await loadHistory(kv))['2026-10-14'];
    expect(closed.overrides).toHaveLength(1);
    expect(closed.perSite['youtube.com']).toBe(60);
  });
});

describe('accrueForeground', () => {
  it('adds seconds within the same day', async () => {
    const kv = memoryKV();
    await saveState(kv, {
      version: 1,
      dayStart: startOf(15),
      perSiteSeconds: { 'youtube.com': 10 },
      passesUntil: {},
      passesUsed: {},
    });
    await accrueForeground(kv, 'youtube.com', day(15, 10), day(15, 10, ) + 10 * 60 * 1000, settings);
    const state = await loadState(kv, settings, day(15, 12));
    expect(state.perSiteSeconds['youtube.com']).toBe(10 + 600);
  });

  it('splits a session that straddles the reset hour across the two days', async () => {
    const stale: DayState = {
      version: 1,
      dayStart: startOf(14),
      perSiteSeconds: {},
      passesUntil: {},
      passesUsed: {},
    };
    const kv = memoryKV({ state: stale });
    // Session: 23:00 on the 14th -> 06:00 on the 15th; reset at 05:00.
    await accrueForeground(kv, 'youtube.com', day(14, 23), day(15, 6), settings);

    const history = await loadHistory(kv);
    expect(history['2026-10-14'].perSite['youtube.com']).toBe(6 * H / 1000); // 23:00 -> 05:00
    const state = await loadState(kv, settings, day(15, 12));
    expect(state.perSiteSeconds['youtube.com']).toBe(1 * H / 1000); // 05:00 -> 06:00
  });
});

describe('recordOverride', () => {
  it('logs the affirmed override under the current usage day', async () => {
    const kv = memoryKV();
    await recordOverride(kv, settings, 'youtube.com', day(15, 14, ));
    const history = await loadHistory(kv);
    const today = history['2026-10-15'];
    expect(today.overrides).toEqual([
      { site: 'youtube.com', ts: day(15, 14), affirmed: true },
    ]);
  });
});

describe('pruneHistory', () => {
  it('keeps the newest 31 days', () => {
    const history: History = {};
    for (let i = 1; i <= 40; i++) history[`2026-09-${String(i).padStart(2, '0')}`] = emptyRecord();
    const pruned = pruneHistory(history);
    expect(Object.keys(pruned)).toHaveLength(31);
    expect(pruned['2026-09-01']).toBeUndefined();
    expect(pruned['2026-09-10']).toBeDefined();
    expect(pruned['2026-09-30']).toBeDefined();
  });
});
