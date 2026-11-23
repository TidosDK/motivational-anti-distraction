import { dayIndex, dayKey, keyAtDayIndex } from './dayMath';
import type { Quote } from './quotes';
import type { DayState, History, UserQuotes } from './types';

export const LOCKOUT_SECONDS = 30;

const words = new Intl.Segmenter(undefined, { granularity: 'word' });
const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

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

function keyboardText(text: string): string {
  return text.normalize()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/…/g, '...');
}

export function typingQuoteText(text: string): string {
  return keyboardText(text).trim().replace(/\s+/g, ' ');
}

export function quoteCharacters(text: string): string[] {
  return Array.from(characters.segment(text), ({ segment }) => segment);
}

export function quoteTypingProgress(quote: readonly string[], answer: string) {
  const typed = quoteCharacters(keyboardText(answer));
  const marks = quote.map((character, index) => {
    if (index === typed.length) return 'next';
    if (index > typed.length) return 'pending';
    return typed[index] === character ? 'correct' : 'incorrect';
  });
  const hasExtra = typed.length > quote.length;
  const hasErrors = marks.includes('incorrect');
  const complete = quote.length > 0 && typed.length === quote.length && !hasErrors;
  return { marks, hasExtra, hasErrors, complete };
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
