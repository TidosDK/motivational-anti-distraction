import { describe, expect, it } from 'vitest';
import { countRecentPasses, createQuoteChallenge, effectiveQuotes, isQuoteAnswerCorrect } from './ceremony';
import { QUOTES } from './quotes';
import { emptyRecord, freshState, loadHistory, loadState, memoryKV } from './storage';
import { DEFAULT_SETTINGS, type History } from './types';

describe('quote challenge', () => {
  it('chooses the longest word and keeps the rest of the quote', () => {
    expect(createQuoteChallenge({ text: 'Use ____ for unusual emphasis!', author: 'Example' })).toEqual({
      text: 'Use ____ for unusual ____!', author: 'Example', expectedWord: 'emphasis', blankIndex: 21,
    });
  });

  it('uses the first word in a tie, including short quotes, and strips punctuation from the answer', () => {
    expect(createQuoteChallenge({ text: 'Go on.', author: '' })).toMatchObject({ text: '____ on.', expectedWord: 'Go' });
    expect(createQuoteChallenge({ text: '“Don’t wait.”', author: '' })).toMatchObject({
      text: '“____ wait.”', expectedWord: 'Dont',
    });
    expect(createQuoteChallenge({ text: '...💡', author: '' })).toBeUndefined();
  });

  it('creates a challenge for every bundled quote', () => {
    expect(QUOTES.every((quote) => createQuoteChallenge(quote)?.expectedWord)).toBe(true);
  });

  it('ignores case and surrounding whitespace without accepting a partial word or empty answer', () => {
    expect(isQuoteAnswerCorrect('  FoCUS \n', 'focus')).toBe(true);
    expect(isQuoteAnswerCorrect('FOC', 'focus')).toBe(false);
    expect(isQuoteAnswerCorrect('focus!', 'focus')).toBe(false);
    expect(isQuoteAnswerCorrect('', '')).toBe(false);
  });
});

describe('effective quote deck', () => {
  const bundled = [{ text: 'Bundled.', author: 'Example' }];
  const custom = { text: 'Personal.', author: 'Personal quote' };

  it('adds personal quotes and keeps duplicate bundled texts to one entry', () => {
    expect(effectiveQuotes(bundled, { quotes: ['Personal.', 'Bundled.'], ownOnly: false })).toEqual([...bundled, custom]);
  });

  it('uses only personal quotes when requested and falls back when empty', () => {
    expect(effectiveQuotes(bundled, { quotes: ['Personal.'], ownOnly: true })).toEqual([custom]);
    expect(effectiveQuotes(bundled, { quotes: [], ownOnly: true })).toEqual(bundled);
  });
});

describe('recent passes', () => {
  it('counts today and six preceding usage days across a roll without double-counting today', async () => {
    const domain = 'example.com';
    const at = (date: number, hour: number) => new Date(2026, 9, date, hour).getTime();
    const entry = (day: number, site = domain) => ({ site, ts: at(day, 12), affirmed: true as const });
    const history: History = {
      '2026-10-08': { ...emptyRecord(), overrides: [entry(8)] },
      '2026-10-09': { ...emptyRecord(), overrides: [entry(9), entry(9, 'other.example.com')] },
      '2026-10-10': { ...emptyRecord(), overrides: [entry(10)] },
      '2026-10-15': { ...emptyRecord(), overrides: [entry(15), entry(15)] },
    };
    const active = { ...freshState(at(15, 5)), passesUsed: { [domain]: 2 } };
    const kv = memoryKV({ state: active, history });
    const before = await loadState(kv, DEFAULT_SETTINGS, at(16, 4));
    expect(countRecentPasses(domain, before, history)).toBe(4);
    const after = await loadState(kv, DEFAULT_SETTINGS, at(16, 5));
    expect(countRecentPasses(domain, after, await loadHistory(kv))).toBe(3);
  });
});
