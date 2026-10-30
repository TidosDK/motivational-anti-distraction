import type { DeckState } from './types';

/** Fisher-Yates with an injectable RNG (deterministic in tests). */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Shuffle-cycled deck: every quote appears once per cycle before any can
 * repeat; on exhaustion the deck reshuffles. Callers persist the returned
 * deck state.
 */
export function nextQuote(
  deck: DeckState | null | undefined,
  count: number,
  rand: () => number,
): { deck: DeckState; index: number } {
  if (count <= 0) throw new Error('quote deck is empty');
  const valid =
    deck != null &&
    deck.cycleOrder.length === count &&
    deck.position >= 0 &&
    deck.position < count &&
    deck.cycleOrder.every((i) => Number.isInteger(i) && i >= 0 && i < count) &&
    new Set(deck.cycleOrder).size === count;
  const cycle = valid
    ? (deck as DeckState)
    : { cycleOrder: shuffle(Array.from({ length: count }, (_, i) => i), rand), position: 0 };
  const index = cycle.cycleOrder[cycle.position];
  return { deck: { cycleOrder: cycle.cycleOrder, position: cycle.position + 1 }, index };
}
