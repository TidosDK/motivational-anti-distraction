import { describe, expect, it } from 'vitest';
import { countRecentPasses, effectiveQuotes, quoteCharacters, quoteTypingProgress, typingQuoteText } from './ceremony';
import { QUOTES } from './quotes';
import { emptyRecord, freshState, loadHistory, loadState, memoryKV } from './storage';
import { DEFAULT_SETTINGS, type History } from './types';

describe('quote typing', () => {
  it('displays keyboard-friendly punctuation and a single space between words', () => {
    expect(typingQuoteText('  “Don’t wait”—\n start…  ')).toBe('"Don\'t wait"- start...');
  });

  it('marks matching characters, typos, and the next character', () => {
    const quote = Array.from('Go now.');
    expect(quoteTypingProgress(quote, 'Gx')).toEqual({
      marks: ['correct', 'incorrect', 'next', 'pending', 'pending', 'pending', 'pending'],
      hasExtra: false, hasErrors: true, complete: false,
    });
    expect(quoteTypingProgress(quote, 'Go')).toMatchObject({ hasErrors: false, complete: false });
  });

  it('requires the full quote, including capitalization, spaces, and punctuation', () => {
    const quote = Array.from('Go now.');
    for (const input of ['now', 'Go now', 'go now.', 'Go  now.', 'Go now. ']) {
      expect(quoteTypingProgress(quote, input).complete).toBe(false);
    }
    expect(quoteTypingProgress(quote, 'Go now. ')).toMatchObject({ hasExtra: true, hasErrors: false });
    expect(quoteTypingProgress(quote, 'Go now.').complete).toBe(true);
  });

  it('accepts equivalent Unicode input and every bundled quote is typeable', () => {
    expect(quoteTypingProgress(Array.from('Café...'), 'Cafe\u0301…').complete).toBe(true);
    expect(quoteTypingProgress(quoteCharacters('Go 👩‍💻'), 'Go 👩‍💻').marks).toHaveLength(4);
    expect(QUOTES.every(({ text }) => {
      const displayed = typingQuoteText(text);
      return quoteTypingProgress(quoteCharacters(displayed), displayed).complete;
    })).toBe(true);
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
