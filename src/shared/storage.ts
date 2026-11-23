import { dayIndex, dayKey, usageDayStart } from './dayMath';
import {
  DEFAULT_SETTINGS,
  DECK_KEY,
  HISTORY_KEY,
  HISTORY_RETENTION_DAYS,
  META_KEY,
  SCHEMA_VERSION,
  SETTINGS_KEY,
  SESSION_KEY,
  STATE_KEY,
  type DayRecord,
  type DayState,
  type DeckState,
  type History,
  type InstallMeta,
  type Settings,
  type ActiveSession,
  type SessionMap,
} from './types';

/** Minimal storage abstraction so tests can run without the chrome namespace. */
export interface KV {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const chromeKV: KV = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

/** Keep a restore from interleaving with a read-modify-write in another extension context. */
export async function withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  return await navigator.locks.request('extension-data', operation);
}

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

export function normalizeSettings(raw?: Partial<Settings>): Settings {
  const passSessionMin = raw?.passSessionMin;
  return {
    version: raw?.version ?? DEFAULT_SETTINGS.version,
    sites: Array.isArray(raw?.sites) ? raw.sites : [],
    combinedBudgetMin: raw?.combinedBudgetMin ?? DEFAULT_SETTINGS.combinedBudgetMin,
    resetHour: raw?.resetHour ?? DEFAULT_SETTINGS.resetHour,
    passSessionMin: passSessionMin != null && Number.isFinite(passSessionMin) && passSessionMin >= 1
      ? passSessionMin : DEFAULT_SETTINGS.passSessionMin,
  };
}

export async function loadSettings(kv: KV): Promise<Settings> {
  return normalizeSettings(await rawGet<Partial<Settings>>(kv, SETTINGS_KEY));
}

export function saveSettings(kv: KV, settings: Settings): Promise<void> {
  return kv.set({ [SETTINGS_KEY]: settings });
}

export function freshState(dayStart: number): DayState {
  return {
    version: SCHEMA_VERSION,
    dayStart,
    perSiteSeconds: {},
    passesUntil: {},
    passesUsed: {},
  };
}

export function emptyRecord(): DayRecord {
  return { perSite: {}, totalSec: 0, overrides: [] };
}

export function saveState(kv: KV, state: DayState): Promise<void> {
  return kv.set({ [STATE_KEY]: state });
}

export function readStoredState(kv: KV): Promise<DayState | undefined> {
  return rawGet<DayState>(kv, STATE_KEY);
}

export function normalizeState(state: Omit<DayState, 'passesUntil'> & { passesUntil?: DayState['passesUntil'] }): DayState {
  // Older builds stored passesActive booleans. Those passes are expired.
  return {
    version: state.version,
    dayStart: state.dayStart,
    perSiteSeconds: state.perSiteSeconds,
    passesUntil: state.passesUntil ?? {},
    passesUsed: state.passesUsed,
  };
}

export async function loadHistory(kv: KV): Promise<History> {
  return (await rawGet<History>(kv, HISTORY_KEY)) ?? {};
}

export async function loadInstallMeta(kv: KV): Promise<InstallMeta | undefined> {
  const raw = await rawGet<Partial<InstallMeta>>(kv, META_KEY);
  if (typeof raw?.installTs !== 'number' || !Number.isFinite(new Date(raw.installTs).getTime())) {
    return undefined;
  }
  return raw.estimated === true ? { installTs: raw.installTs, estimated: true } : { installTs: raw.installTs };
}

/** Called by the worker once it has loaded and rolled existing history. */
export async function ensureInstallMeta(kv: KV, now: number): Promise<void> {
  if (await loadInstallMeta(kv)) return;

  const oldest = Object.keys(await loadHistory(kv)).sort().find((key) => {
    return Number.isFinite(dayIndex(key)) && key <= dayKey(now);
  });
  if (oldest) {
    // Use local time so the recorded date is the same on either side of UTC.
    const { resetHour } = await loadSettings(kv);
    const date = new Date(`${oldest}T00:00:00`);
    date.setHours(resetHour);
    await kv.set({ [META_KEY]: { installTs: Math.min(date.getTime(), now), estimated: true } satisfies InstallMeta });
  } else {
    await kv.set({ [META_KEY]: { installTs: now } satisfies InstallMeta });
  }
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

/** Keep the newest recorded usage days. */
export function pruneHistory(history: History, keepDays = HISTORY_RETENTION_DAYS): History {
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
  const stored = await readStoredState(kv);
  const current = usageDayStart(now, settings.resetHour);
  if (stored?.dayStart === current) return normalizeState(stored);

  const state = freshState(current);
  if (stored) {
    const history = await loadHistory(kv);
    const key = dayKey(stored.dayStart);
    history[key] = mergeDayRecord(history[key] ?? emptyRecord(), stored);
    await kv.set({ [HISTORY_KEY]: pruneHistory(history), [STATE_KEY]: state });
  } else {
    await saveState(kv, state);
  }
  return state;
}

export function loadUsageSnapshot(): Promise<{ settings: Settings; state: DayState; now: number }> {
  return withStorageLock(async () => {
    const settings = await loadSettings(chromeKV);
    const now = Date.now();
    return { settings, state: await loadState(chromeKV, settings, now), now };
  });
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
  const fresh = freshState(boundary);
  fresh.perSiteSeconds[domain] = post;
  await kv.set({ [HISTORY_KEY]: pruneHistory(history), [STATE_KEY]: fresh });
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

/** Visible-window focus sessions persisted across service-worker evictions. */
export interface StoredSessions {
  sessions: SessionMap;
  savedAt: number;
}

/** Legacy single-focused-window shape stored by pre-multi-monitor builds. */
interface LegacyStoredSession {
  session: ActiveSession | null;
  savedAt: number;
}

export async function loadSessions(kv: KV): Promise<StoredSessions | undefined> {
  const raw = await rawGet<StoredSessions | LegacyStoredSession>(kv, SESSION_KEY);
  if (!raw) return undefined;
  if ('sessions' in raw) return raw;
  const legacy = raw.session;
  return legacy
    ? { sessions: { [String(legacy.windowId)]: legacy }, savedAt: raw.savedAt }
    : { sessions: {}, savedAt: raw.savedAt };
}

export function saveSessions(kv: KV, sessions: SessionMap, savedAt: number): Promise<void> {
  return kv.set({ [SESSION_KEY]: { sessions, savedAt } });
}
