import { describe, expect, it } from 'vitest';
import { buildBackup, buildHistoryCsv, buildOverridesCsv, parseBackup } from './backup';
import { freshState } from './storage';
import { DEFAULT_SETTINGS, SCHEMA_VERSION, type History } from './types';

const now = new Date(2026, 10, 15, 14, 5).getTime();
const settings = {
  ...DEFAULT_SETTINGS,
  sites: [{ domain: 'example.com', limitMin: 20, passes: 2 }],
  passSessionMin: 15,
};
const state = {
  ...freshState(new Date(2026, 10, 15, 5).getTime()),
  perSiteSeconds: { 'example.com': 83.25 },
  passesUntil: { 'example.com': now + 60_000 },
  passesUsed: { 'example.com': 1 },
};
const history: History = {
  '2026-11-15': { perSite: { 'z.example': 61 }, totalSec: 61, overrides: [] },
  '2026-11-14': {
    perSite: { 'example.com': 94 }, totalSec: 94,
    overrides: [{ site: 'example.com', ts: now - 86_400_000, affirmed: true }],
  },
};
const deck = { cycleOrder: [2, 0, 1], position: 2 };
const userQuotes = { quotes: ['Stay with your purpose.', 'Choose a small step.', 'Keep going.'], ownOnly: true };
const backup = buildBackup(settings, state, history, deck, userQuotes, now);
const parse = (input: unknown) => parseBackup(JSON.stringify(input), now);

describe('backup envelope', () => {
  it('round-trips usage, an active pass, and the personal deck and its position', () => {
    expect(backup).toEqual({
      format: 'motivational-anti-distraction-backup', version: SCHEMA_VERSION,
      exportedAt: new Date(now).toISOString(), data: { settings, state, history, deck, userQuotes },
    });
    expect(parse(backup)).toEqual({ ok: true, data: backup.data });
  });

  it('represents an undrawn deck and preserves an exhausted cycle', () => {
    const fresh = buildBackup(settings, state, history, undefined, { quotes: [], ownOnly: false }, now);
    expect(fresh.data.deck).toEqual({ cycleOrder: [], position: 0 });
    expect(fresh.data.userQuotes).toEqual({ quotes: [], ownOnly: false });
    expect(parse(fresh)).toEqual({ ok: true, data: fresh.data });
    expect(parse({ ...backup, data: { ...backup.data, deck: { ...deck, position: 3 } } }).ok).toBe(true);
  });

  it('rejects malformed JSON and other formats', () => {
    expect(parseBackup('{', now)).toEqual({ ok: false, errors: ['The file contains malformed JSON.'] });
    expect(parse({ ...backup, format: 'another-extension' })).toMatchObject({ ok: false });
  });

  it.each([SCHEMA_VERSION - 1, SCHEMA_VERSION + 1, String(SCHEMA_VERSION), undefined])(
    'rejects unsupported version %s', (version) => {
      expect(parse({ ...backup, version })).toMatchObject({ ok: false, errors: [expect.stringMatching(/version/)] });
    },
  );

  it.each([-1, 'invalid', now + 86_400_001])('rejects corrupt dayStart %s', (dayStart) => {
    expect(parse({ ...backup, data: { ...backup.data, state: { ...state, dayStart } } }))
      .toMatchObject({ ok: false, errors: [expect.stringMatching(/state\.dayStart/)] });
  });

  it('reports validation errors from every bad section', () => {
    expect(parse({ ...backup, data: {
      settings: { ...settings, resetHour: 24 }, state: { ...state, perSiteSeconds: { 'example.com': -1 } },
      history: { '2026-02-30': history['2026-11-14'] }, deck: { ...deck, position: 20 },
      userQuotes: { quotes: [42], ownOnly: false },
    } })).toMatchObject({ ok: false, errors: [
      expect.stringMatching(/settings\.resetHour/), expect.stringMatching(/state\.perSiteSeconds/),
      expect.stringMatching(/history/), expect.stringMatching(/deck\.position/), expect.stringMatching(/userQuotes/),
    ] });
  });

  it('strips unknown fields and defaults missing fields from older stored data', () => {
    const input = {
      ...backup, ignored: true, data: {
        settings: { ...settings, passSessionMin: undefined, extra: 'ignore', sites: [{ ...settings.sites[0], extra: 9 }] },
        state: { ...state, passesUntil: undefined, passesActive: { 'example.com': true } },
        history: { ...history, '2026-11-15': { ...history['2026-11-15'], extra: [] } },
        deck: { ...deck, extra: true }, otherKey: {},
      },
    };
    expect(parse(input)).toEqual({ ok: true, data: {
      settings: { ...settings, passSessionMin: DEFAULT_SETTINGS.passSessionMin },
      state: { ...state, passesUntil: {} }, history, deck, userQuotes: { quotes: [], ownOnly: false },
    } });
  });
});

describe('CSV exports', () => {
  it('sorts site columns and aligns sparse days while rounding to whole minutes', () => {
    expect(buildHistoryCsv(history)).toBe(
      'day,example.com,z.example,combined_minutes,override_count\r\n' +
      '2026-11-14,2,0,2,1\r\n2026-11-15,0,1,1,0\r\n',
    );
    expect(buildHistoryCsv({})).toBe('day,combined_minutes,override_count\r\n');
  });

  it('writes local timestamps and quotes commas, quotes, and newlines', () => {
    const sample: History = { '2026-11-15': { perSite: {}, totalSec: 0, overrides: [
      { site: 'comma,"quote"\nline', ts: now, affirmed: true },
    ] } };
    expect(buildOverridesCsv(sample)).toBe('site,timestamp,affirmed\r\n"comma,""quote""\nline",2026-11-15T14:05:00,true\r\n');
    expect(buildOverridesCsv({})).toBe('site,timestamp,affirmed\r\n');
  });
});
