# Design

## Context

See proposal.md — Why. Today the interstitial asks the worker for the next
quote (`nextQuote` message), shuffle-cycles by index in `deck.ts` (which
already rebuilds the cycle when deck length changes), shows the quote plus
the fixed confession checkboxes, and gates Quick Override on
countdown + all-ticked. `siteStatus` already returns per-domain pass state.
Countdown behavior (page-local, reload restarts) is spec-pinned and stays.

## Goals / Non-Goals

**Goals:**
- One ceremony shape, always: quote with one blanked word + 30 s countdown;
  unlock requires the correct word.
- User quotes join the deck with zero changes to `deck.ts` mechanics.
- Friction, not security: page-side validation is the same trust level the
  checkboxes had (DevTools could always tick them).

**Non-Goals:**
- No task rotation, no plan pinning (ruled out: with one task type there is
  nothing to re-roll into, so the pin machinery has no purpose — reloads
  draw the next quote, restart the countdown, and cost the full wait).
- No "future-me" self-messages (ruled out).
- No rich text or formatting in quotes (plain strings, `textContent`
  rendering throughout).

## Decisions

### D1: Worker picks the blank; page validates
The `nextQuote` response is extended to
`{ text: string /* quote with the word replaced by "____" */, expectedWord:
string, author: string }`. The worker chooses the blank deterministically:
longest word of the quote (preferring words ≥ 4 characters), punctuation
stripped for the expected answer. The page compares trimmed, lower-cased
input. Alternatives: page-side blanking (rejected — makes the choice a pure
view concern that could drift from what the deck served); server-side
validation (rejected — ceremony friction, not a security boundary, and the
pass spend is already page-initiated).

### D2: Draw-per-load, no pinning
`nextQuote` keeps advancing the deck on every interstitial load, exactly as
today. Reload-spamming therefore consumes deck entries while costing a full
30 s each time — with a single task type there is no easier task to fish
for, which was the only reason the earlier pinned-plan design existed. The
`userQuotes`/`ownOnly` change cannot break this: the deck cycle is by
position in the effective deck.

### D3: `userQuotes` key, effective deck in the worker
New local key `userQuotes: { quotes: string[], ownOnly: boolean }` with a
tolerant loader/saver (each quote capped at ~500 chars, trimmed, empty
dropped). The worker builds the effective deck per draw: `ownOnly &&
quotes.length > 0 ? quotes : [...BUNDLED, ...quotes]`. `deck.ts` needs no
change (its length-mismatch rebuild already handles deck edits, which
restarts the cycle — spec allows).

### D4: `passesLast7Days` computed in `siteStatus`
Added to the existing `siteStatus` response: today's
`state.passesUsed[domain]` plus override log entries for the domain in the
6 preceding usage-day keys (day keys via the existing day math). The
interstitial renders one factual line when > 0. No new message types, no
storage growth.

### D5: Checklist removal is subtractive
Delete the confession-checkbox markup/handlers from the interstitial and the
bundled confession list constant; the `override-ritual` delta REMOVES the
requirement. Note: the delta's MODIFIED "Unlock ceremony" keeps the legacy
scenario name "Button locked without full checklist" (body rewritten to the
blank-word gate) because the OpenSpec validator refuses MODIFIED blocks
that drop scenario names — cosmetic debt only.

### D6: Backup envelope extension
When this change lands after `add-data-portability`, `backup.ts` gains a
`userQuotes` section: exported always, imported with `{ quotes: [],
ownOnly: false }` when absent (the documented exact-match exception).

## Risks / Trade-offs

- [The expected word is visible in the page/DevTools] → Accepted; identical
  trust model to ticking checkboxes — the ceremony is friction, not a
  security boundary.
- [One task type can still habituate] → Accepted; it requires reading the
  quote, which the checklist did not.
- [Reload-spam burns deck entries] → Accepted; each reload costs the full
  countdown and shows a different quote — no advantage gained, no state
  corrupted.
- [Very short quotes (all words < 4 chars)] → Longest word is blanked
  regardless; no fallback task exists.
