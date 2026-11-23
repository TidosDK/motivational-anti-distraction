import { normalizeDomain } from './domains';
import { normalizeSettings, normalizeState, normalizeUserQuotes } from './storage';
import { SCHEMA_VERSION, type DayState, type DeckState, type History, type Settings, type UserQuotes } from './types';

const BACKUP_FORMAT = 'motivational-anti-distraction-backup';
const DAY_MS = 24 * 60 * 60 * 1000;

interface BackupData {
  settings: Settings;
  state: DayState;
  history: History;
  deck: DeckState;
  userQuotes: UserQuotes;
}

interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: BackupData;
}

type ParseResult = { ok: true; data: BackupData } | { ok: false; errors: string[] };

export function buildBackup(
  settings: Settings,
  state: DayState,
  history: History,
  deck: DeckState | undefined,
  userQuotes: UserQuotes,
  nowMs: number,
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: SCHEMA_VERSION,
    exportedAt: new Date(nowMs).toISOString(),
    data: {
      settings: normalizeSettings(settings),
      state: normalizeState(state),
      history,
      deck: deck ?? { cycleOrder: [], position: 0 },
      userQuotes: normalizeUserQuotes(userQuotes),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function wholeNumber(value: unknown): value is number {
  return nonnegative(value) && Number.isInteger(value);
}

function timestamp(value: unknown): value is number {
  return wholeNumber(value) && Number.isFinite(new Date(value).getTime());
}

function isDomain(value: unknown): value is string {
  // The options page may have already stripped a leading www from this hostname.
  return typeof value === 'string' && normalizeDomain(`www.${value}`) === value;
}

function validSectionVersion(value: unknown): boolean {
  return value === undefined || value === SCHEMA_VERSION;
}

function domainNumbers(
  value: unknown,
  path: string,
  valid: (value: unknown) => value is number,
): Record<string, number> {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const result: Record<string, number> = {};
  for (const [domain, number] of Object.entries(value)) {
    if (!isDomain(domain) || !valid(number)) throw new Error(`${path} contains an invalid domain or value.`);
    result[domain] = number;
  }
  return result;
}

function readSettings(value: unknown): Settings {
  if (!isRecord(value) || !Array.isArray(value.sites)) throw new Error('settings.sites must be a list.');
  if (!validSectionVersion(value.version)) throw new Error('settings.version is unsupported.');
  if (!wholeNumber(value.combinedBudgetMin) || value.combinedBudgetMin < 1) {
    throw new Error('settings.combinedBudgetMin must be a positive whole number.');
  }
  if (!wholeNumber(value.resetHour) || value.resetHour > 23) {
    throw new Error('settings.resetHour must be a whole number from 0 to 23.');
  }

  const domains = new Set<string>();
  const sites = value.sites.map((site: unknown, index: number) => {
    if (!isRecord(site) || !isDomain(site.domain) || domains.has(site.domain)) {
      throw new Error(`settings.sites[${index}] must have a valid, unique domain.`);
    }
    const { domain, limitMin, passes } = site;
    if ((limitMin !== null && (!wholeNumber(limitMin) || limitMin < 1)) || !wholeNumber(passes)) {
      throw new Error(`settings.sites[${index}] has an invalid limit or day-pass allowance.`);
    }
    domains.add(domain);
    return { domain, limitMin, passes };
  });

  return normalizeSettings({
    sites,
    combinedBudgetMin: value.combinedBudgetMin,
    resetHour: value.resetHour,
    passSessionMin: typeof value.passSessionMin === 'number' ? value.passSessionMin : undefined,
  });
}

function readState(value: unknown, nowMs: number): DayState {
  if (!isRecord(value)) throw new Error('state must be an object.');
  if (!validSectionVersion(value.version)) throw new Error('state.version is unsupported.');
  if (!timestamp(value.dayStart)) throw new Error('state.dayStart must be a valid timestamp.');
  if (value.dayStart > nowMs + DAY_MS) throw new Error('state.dayStart is more than 24 hours in the future.');

  return normalizeState({
    version: SCHEMA_VERSION,
    dayStart: value.dayStart,
    perSiteSeconds: domainNumbers(value.perSiteSeconds, 'state.perSiteSeconds', nonnegative),
    passesUsed: domainNumbers(value.passesUsed, 'state.passesUsed', wholeNumber),
    passesUntil: value.passesUntil === undefined
      ? undefined : domainNumbers(value.passesUntil, 'state.passesUntil', timestamp),
  });
}

function readHistory(value: unknown): History {
  if (!isRecord(value)) throw new Error('history must be an object.');
  const history: History = {};
  for (const [day, record] of Object.entries(value)) {
    const date = new Date(`${day}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || !date.toISOString().startsWith(day)) {
      throw new Error('history contains an invalid usage-day date.');
    }
    if (!isRecord(record) || !nonnegative(record.totalSec) || !Array.isArray(record.overrides)) {
      throw new Error(`history for ${day} must include total seconds and an override list.`);
    }
    history[day] = {
      perSite: domainNumbers(record.perSite, `history for ${day}`, nonnegative),
      totalSec: record.totalSec,
      overrides: record.overrides.map((entry: unknown) => {
        if (!isRecord(entry) || !isDomain(entry.site) || !timestamp(entry.ts) || entry.affirmed !== true) {
          throw new Error(`history for ${day} contains an invalid override.`);
        }
        return { site: entry.site, ts: entry.ts, affirmed: true };
      }),
    };
  }
  return history;
}

function readDeck(value: unknown): DeckState {
  if (!isRecord(value) || !Array.isArray(value.cycleOrder) || !value.cycleOrder.every(wholeNumber)) {
    throw new Error('deck.cycleOrder must be a list of nonnegative quote indices.');
  }
  if (!wholeNumber(value.position) || value.position > value.cycleOrder.length) {
    throw new Error('deck.position must point within the cycle or just past its end.');
  }
  return { cycleOrder: value.cycleOrder, position: value.position };
}

function readUserQuotes(value: unknown): UserQuotes {
  if (value === undefined) return normalizeUserQuotes(undefined);
  if (!isRecord(value) || !Array.isArray(value.quotes) || typeof value.ownOnly !== 'boolean' ||
      !value.quotes.every((quote) => typeof quote === 'string')) {
    throw new Error('userQuotes must contain a list of quote strings and a true or false ownOnly setting.');
  }
  return normalizeUserQuotes(value);
}

export function parseBackup(text: string, nowMs = Date.now()): ParseResult {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file contains malformed JSON.'] };
  }
  if (!isRecord(envelope) || envelope.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['The file is not a Motivational Anti-Distraction backup.'] };
  }
  if (envelope.version !== SCHEMA_VERSION) {
    return { ok: false, errors: [`Unsupported backup version. This extension accepts version ${SCHEMA_VERSION}.`] };
  }
  if (typeof envelope.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(envelope.exportedAt) ||
      !Number.isFinite(Date.parse(envelope.exportedAt))) {
    return { ok: false, errors: ['exportedAt must be an ISO timestamp.'] };
  }
  const data = envelope.data;
  if (!isRecord(data)) return { ok: false, errors: ['The backup has no data object.'] };

  const errors: string[] = [];
  function validate<T>(read: () => T): T | undefined {
    try {
      return read();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'The backup contains invalid data.');
      return undefined;
    }
  }
  const settings = validate(() => readSettings(data.settings));
  const state = validate(() => readState(data.state, nowMs));
  const history = validate(() => readHistory(data.history));
  const deck = validate(() => readDeck(data.deck));
  const userQuotes = validate(() => readUserQuotes(data.userQuotes));
  if (settings && state && history && deck && userQuotes) return { ok: true, data: { settings, state, history, deck, userQuotes } };
  return { ok: false, errors };
}

function csv(rows: (string | number | boolean)[][]): string {
  return rows.map((row) => row.map((value) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',')).join('\r\n') + '\r\n';
}

export function buildHistoryCsv(history: History): string {
  const days = Object.entries(history).sort(([a], [b]) => a.localeCompare(b));
  const domains = [...new Set(days.flatMap(([, record]) => Object.keys(record.perSite)))].sort();
  return csv([
    ['day', ...domains, 'combined_minutes', 'override_count'],
    ...days.map(([day, record]) => [
      day,
      ...domains.map((domain) => Math.round((record.perSite[domain] ?? 0) / 60)),
      Math.round(record.totalSec / 60),
      record.overrides.length,
    ]),
  ]);
}

function localTimestamp(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildOverridesCsv(history: History): string {
  const overrides = Object.values(history).flatMap((day) => day.overrides).sort((a, b) => a.ts - b.ts);
  return csv([
    ['site', 'timestamp', 'affirmed'],
    ...overrides.map((entry) => [entry.site, localTimestamp(entry.ts), entry.affirmed]),
  ]);
}
