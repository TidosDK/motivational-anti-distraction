import { describe, expect, it } from 'vitest';
import { nextQuote, shuffle } from './deck';
import { loadDeck, memoryKV, saveDeck } from './storage';
import { QUOTES } from './quotes';
import type { DeckState } from './types';

/** Deterministic PRNG so cycles are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('shuffle', () => {
  it('is a permutation', () => {
    const out = shuffle([1, 2, 3, 4, 5], rng(1));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not mutate the input', () => {
    const src = [1, 2, 3];
    shuffle(src, rng(2));
    expect(src).toEqual([1, 2, 3]);
  });
});

describe('nextQuote', () => {
  it('shows every quote once per cycle with no repeats', () => {
    const count = 10;
    let deck: DeckState | null = null;
    const seen: number[] = [];
    for (let i = 0; i < count; i++) {
      const r = nextQuote(deck, count, rng(i + 7));
      deck = r.deck;
      seen.push(r.index);
    }
    expect(new Set(seen).size).toBe(count);
    expect(seen.every((i) => i >= 0 && i < count)).toBe(true);
  });

  it('reshuffles on cycle exhaustion and cannot repeat across the seam until a full new cycle runs', () => {
    const count = 5;
    let deck: DeckState | null = null;
    const drawn: number[] = [];
    for (let i = 0; i < count * 2; i++) {
      const r = nextQuote(deck, count, rng(i + 100));
      deck = r.deck;
      drawn.push(r.index);
    }
    // Two full cycles, each a complete permutation.
    expect(new Set(drawn.slice(0, count)).size).toBe(count);
    expect(new Set(drawn.slice(count)).size).toBe(count);
  });

  it('survives a corrupted persisted deck by reshuffling', () => {
    const bad: DeckState = { cycleOrder: [0, 0, 99], position: 5 };
    const r = nextQuote(bad, 3, rng(42));
    expect(r.index).toBeGreaterThanOrEqual(0);
    expect(r.index).toBeLessThan(3);
  });

  it('handles the real quote deck over more draws than there are quotes', () => {
    let deck: DeckState | null = null;
    const firstCycle = new Set<number>();
    for (let i = 0; i < QUOTES.length; i++) {
      const r = nextQuote(deck, QUOTES.length, Math.random);
      deck = r.deck;
      firstCycle.add(r.index);
    }
    expect(firstCycle.size).toBe(QUOTES.length);
  });
});

describe('deck persistence (simulated restarts)', () => {
  it('continues the cycle after save + reload of the deck state', async () => {
    const kv = memoryKV();
    const count = 8;

    // Session 1: draw 3 quotes, persisting after each.
    const drawn: number[] = [];
    for (let i = 0; i < 3; i++) {
      const deck = await loadDeck(kv);
      const r = nextQuote(deck ?? null, count, rng(i));
      await saveDeck(kv, r.deck);
      drawn.push(r.index);
    }

    // "Restart": fresh read of the same storage continues where we left off.
    const resumed = await loadDeck(kv);
    expect(resumed?.position).toBe(3);

    const rest: number[] = [];
    for (let i = 3; i < count; i++) {
      const deck = await loadDeck(kv);
      const r = nextQuote(deck ?? null, count, rng(i + 50));
      await saveDeck(kv, r.deck);
      rest.push(r.index);
    }
    const cycle = [...drawn, ...rest];
    expect(new Set(cycle).size).toBe(count); // no repeats across the restart
  });
});
