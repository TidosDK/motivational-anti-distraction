import { dayKey, usageDayStart } from './dayMath';
import {
  DEFAULT_SETTINGS,
  DECK_KEY,
  HISTORY_KEY,
  SCHEMA_VERSION,
  SETTINGS_KEY,
  STATE_KEY,
  type DayRecord,
  type DayState,
  type DeckState,
  type History,
  type Settings,
} from './types';

/** Minimal storage abstraction so tests can run without the chrome namespace. */
export interface KV {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const chromeKV: KV = {
  get: (keys) =>
    new Promise((resolve) => {
      chrome.storage.local.get(keys, (items) => resolve(items as Record<string, unknown>));
    }),
  set: (items) => new Promise((resolve) => chrome.storage.local.set(items, () => resolve())),
};

/** In-memory KV for tests. */
export function memoryKV(initial: Record<string, unknown> = {}): KV {
  const data: Record<string, unknown> = { ...initial };
  return {
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data[k] = structuredClone(v);
    },
  };
}

async function rawGet<T>(kv: KV, key: string): Promise<T | undefined> {
  const res = await kv.get([key]);
  return res[key] as T | undefined;
}

export async function loadSettings(kv: KV): Promise<Settings> {
  const raw = await rawGet<Partial<Settings>>(kv, SETTINGS_KEY);
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...raw,
    sites: Array.isArray(raw.sites) ? raw.sites : [],
  };
}

export function saveSettings(kv: KV, settings: Settings): Promise<void> {
  return kv.set({ [SETTINGS_KEY]: settings });
}

export function freshState(dayStart: number): DayState {
  return {
    version: SCHEMA_VERSION,
    dayStart,
    perSiteSeconds: {},
    passesActive: {},
    passesUsed: {},
  };
}

export function emptyRecord(): DayRecord {
  return { perSite: {}, totalSec: 0, overrides: [] };
}

export function saveState(kv: KV, state: DayState): Promise<void> {
  return kv.set({ [STATE_KEY]: state });
}

export async function loadHistory(kv: KV): Promise<History> {
  return (await rawGet<History>(kv, HISTORY_KEY)) ?? {};
}

export function saveHistory(kv: KV, history: History): Promise<void> {
  return kv.set({ [HISTORY_KEY]: history });
}

/** Merge a closed day's counters into its history record (overrides survive). */
function mergeDayRecord(record: DayRecord, state: DayState): DayRecord {
  const perSite = { ...record.perSite };
  for (const [domain, sec] of Object.entries(state.perSiteSeconds)) {
    perSite[domain] = (perSite[domain] ?? 0) + sec;
  }
  return {
    perSite,
    totalSec: Object.values(perSite).reduce((a, b) => a + b, 0),
    overrides: record.overrides,
  };
}

/** Keep the newest `keepDays` days; spec requires retaining at least 30. */
export function pruneHistory(history: History, keepDays = 31): History {
  const keys = Object.keys(history).sort();
  if (keys.length <= keepDays) return history;
  const out: History = {};
  for (const k of keys.slice(keys.length - keepDays)) out[k] = history[k];
  return out;
}

/**
 * Load the current day's state, rolling lazily: if the stored day is stale,
 * its counters are folded into history and a fresh day starts. Lazy rolling
 * (compare timestamps on read) means correctness never depends on an alarm
 * firing exactly at the reset hour.
 */
export async function loadState(kv: KV, settings: Settings, now: number): Promise<DayState> {
  const stored = await rawGet<DayState>(kv, STATE_KEY);
  const current = usageDayStart(now, settings.resetHour);
  let state = stored ?? freshState(current);
  if (state.dayStart !== current) {
    const history = await loadHistory(kv);
    const key = dayKey(state.dayStart);
    history[key] = mergeDayRecord(history[key] ?? emptyRecord(), state);
    await saveHistory(kv, pruneHistory(history));
    state = freshState(current);
  }
  await saveState(kv, state);
  return state;
}

/**
 * Add wall-clock seconds [fromMs, toMs) to a site's meter, splitting at the
 * day boundary so a session straddling the reset hour lands in the right days.
 */
export async function accrueForeground(
  kv: KV,
  domain: string,
  fromMs: number,
  toMs: number,
  settings: Settings,
): Promise<void> {
  if (toMs <= fromMs) return;
  const stored = await rawGet<DayState>(kv, STATE_KEY);
  const boundary = usageDayStart(toMs, settings.resetHour);
  const base = stored ?? freshState(boundary);
  if (base.dayStart === boundary) {
    base.perSiteSeconds[domain] = (base.perSiteSeconds[domain] ?? 0) + (toMs - fromMs) / 1000;
    await saveState(kv, base);
    return;
  }
  const total = (toMs - fromMs) / 1000;
  const pre = Math.max(0, Math.min(total, (boundary - fromMs) / 1000));
  const post = total - pre;
  base.perSiteSeconds[domain] = (base.perSiteSeconds[domain] ?? 0) + pre;
  const history = await loadHistory(kv);
  const key = dayKey(base.dayStart);
  history[key] = mergeDayRecord(history[key] ?? emptyRecord(), base);
  await saveHistory(kv, pruneHistory(history));
  const fresh = freshState(boundary);
  fresh.perSiteSeconds[domain] = post;
  await saveState(kv, fresh);
}

/** Record that a day-pass was spent on `site` (with the affirmed checklist). */
export async function recordOverride(
  kv: KV,
  settings: Settings,
  site: string,
  now: number,
): Promise<void> {
  const state = await loadState(kv, settings, now);
  const history = await loadHistory(kv);
  const key = dayKey(state.dayStart);
  const record = history[key] ?? emptyRecord();
  record.overrides.push({ site, ts: now, affirmed: true });
  history[key] = record;
  await saveHistory(kv, pruneHistory(history));
}

export async function loadDeck(kv: KV): Promise<DeckState | undefined> {
  return rawGet<DeckState>(kv, DECK_KEY);
}

export function saveDeck(kv: KV, deck: DeckState): Promise<void> {
  return kv.set({ [DECK_KEY]: deck });
}
