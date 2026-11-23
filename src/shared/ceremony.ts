import { dayIndex, dayKey, keyAtDayIndex } from './dayMath';
import type { Quote } from './quotes';
import type { DayState, History, UserQuotes } from './types';

export const LOCKOUT_SECONDS = 30;
export const QUOTE_BLANK = '____';

export interface QuoteChallenge extends Quote {
  expectedWord: string;
  blankIndex: number;
}

const words = new Intl.Segmenter(undefined, { granularity: 'word' });

export function hasQuoteWord(text: string): boolean {
  for (const word of words.segment(text)) {
    if (word.isWordLike && /[\p{L}\p{N}]/u.test(word.segment)) return true;
  }
  return false;
}

export function effectiveQuotes(bundled: readonly Quote[], userQuotes: UserQuotes): readonly Quote[] {
  const custom = userQuotes.quotes.map((text) => ({ text, author: 'Personal quote' }));
  if (!custom.length) return bundled;
  if (userQuotes.ownOnly) return custom;

  const bundledTexts = new Set(bundled.map(({ text }) => text));
  return [...bundled, ...custom.filter(({ text }) => !bundledTexts.has(text))];
}

export function createQuoteChallenge(quote: Quote): QuoteChallenge | undefined {
  let blank: { word: string; index: number; length: number; score: number } | undefined;
  for (const { segment, index, isWordLike } of words.segment(quote.text)) {
    if (!isWordLike || !/[\p{L}\p{N}]/u.test(segment)) continue;
    const word = segment.replace(/[^\p{L}\p{N}\p{M}]/gu, '');
    const score = Array.from(word).length;
    if (!blank || score > blank.score) blank = { word, index, length: segment.length, score };
  }
  if (!blank) return undefined;
  return {
    text: quote.text.slice(0, blank.index) + QUOTE_BLANK + quote.text.slice(blank.index + blank.length),
    author: quote.author,
    expectedWord: blank.word,
    blankIndex: blank.index,
  };
}

export function isQuoteAnswerCorrect(answer: string, expectedWord: string): boolean {
  return expectedWord.length > 0 && answer.trim().normalize().toLowerCase() === expectedWord.normalize().toLowerCase();
}

export function countRecentPasses(domain: string, state: DayState, history: History): number {
  const today = dayIndex(dayKey(state.dayStart));
  let count = state.passesUsed[domain] ?? 0;
  for (let offset = 1; offset <= 6; offset++) {
    const record = history[keyAtDayIndex(today - offset)];
    count += record?.overrides.filter((entry) => entry.site === domain).length ?? 0;
  }
  return count;
}
