export const SETTINGS_KEY = 'settings';
export const STATE_KEY = 'state';
export const HISTORY_KEY = 'history';
export const DECK_KEY = 'deck';
export const SESSION_KEY = 'activeSession';

export const SCHEMA_VERSION = 1;

export interface SiteSetting {
  /** Normalized bare domain, e.g. "youtube.com" (matches the domain and subdomains). */
  domain: string;
  /** Per-site daily limit in minutes; null = governed only by the combined budget. */
  limitMin: number | null;
  /** Day-passes available per usage day. */
  passes: number;
}

export interface Settings {
  version: number;
  sites: SiteSetting[];
  /** Combined "unproductive time" budget across all blocked sites, in minutes. */
  combinedBudgetMin: number;
  /** Local hour (0-23) at which the usage day resets. */
  resetHour: number;
  /** How long a spent day-pass keeps its site open, in minutes. */
  passSessionMin: number;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SCHEMA_VERSION,
  sites: [],
  combinedBudgetMin: 120,
  resetHour: 5,
  passSessionMin: 10,
};

export interface OverrideEntry {
  site: string;
  ts: number;
  affirmed: true;
}

/** Counters for the current usage day. */
export interface DayState {
  version: number;
  /** Epoch ms of the current usage day's start (see dayMath.ts). */
  dayStart: number;
  /** Foreground seconds per blocked domain. */
  perSiteSeconds: Record<string, number>;
  /** Domains currently exempt via a spent pass: expiry epoch-ms. */
  passesUntil: Record<string, number>;
  /** Day-passes spent per domain today. */
  passesUsed: Record<string, number>;
}

export interface DayRecord {
  perSite: Record<string, number>;
  totalSec: number;
  overrides: OverrideEntry[];
}

/** Closed usage days, keyed by local date "YYYY-MM-DD" of the day's start. */
export type History = Record<string, DayRecord>;

export interface DeckState {
  cycleOrder: number[];
  position: number;
}

/** The foreground-tab session currently being counted (background/index.ts). */
export interface ActiveSession {
  windowId: number;
  tabId: number;
  domain: string;
  sinceMs: number;
}

/**
 * Counted sessions keyed by window id (stringified for storage JSON). One
 * entry per visible window whose active tab is a blocked site.
 */
export type SessionMap = Record<string, ActiveSession>;
