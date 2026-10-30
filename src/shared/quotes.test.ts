import { describe, expect, it } from 'vitest';
import { QUOTES } from './quotes';

describe('quote deck contents', () => {
  it('bundles at least 150 quotes', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(150);
  });

  it('has no duplicate texts', () => {
    const texts = QUOTES.map((q) => q.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('has non-empty text and author for every quote', () => {
    for (const q of QUOTES) {
      expect(q.text.length).toBeGreaterThan(10);
      expect(q.author.length).toBeGreaterThan(0);
    }
  });
});
