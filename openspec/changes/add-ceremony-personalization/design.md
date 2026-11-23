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
- Show the full quote and a 30-second countdown. Unlock requires typing the
  full quote correctly.
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

### D1: The page checks the full quote as the user types
The worker returns the quote text and author. The typing prompt displays
keyboard-friendly equivalents for smart apostrophes, quotation marks, dashes,
and ellipses. It displays stored whitespace as single spaces. The page
marks each typed position as correct or incorrect and indicates the next
character. Capitalization, punctuation, and spacing must match the visible
text. Paste and drop are blocked in the typing field.

### D2: Draw-per-load, no pinning
`nextQuote` keeps advancing the deck on every interstitial load, exactly as
today. Reload-spamming therefore consumes deck entries while costing a full
30 s each time — with a single task type there is no easier task to fish
for, which was the only reason the earlier pinned-plan design existed. The
`userQuotes`/`ownOnly` change cannot break this: the deck cycle is by
position in the effective deck.

### D3: `userQuotes` key, effective deck in the worker
New local key `userQuotes: { quotes: string[], ownOnly: boolean }` with a
tolerant loader/saver. Each quote is trimmed and capped at 500 characters.
Empty entries, duplicates, and entries with no word are dropped. The worker
combines personal and bundled entries per draw and uses the selected deck
mode. Each edit saves the quotes and resets the cycle in the same storage
write, including edits that leave the deck the same size.

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
scenario name "Button locked without full checklist" (body rewritten for
the full quote) because the OpenSpec validator refuses MODIFIED blocks
that drop scenario names — cosmetic debt only.

### D6: Backup envelope extension
When this change lands after `add-data-portability`, `backup.ts` gains a
`userQuotes` section: exported always, imported with `{ quotes: [],
ownOnly: false }` when absent (the documented exact-match exception).

## Risks / Trade-offs

- [One task type can still habituate] → Accepted; it requires reading the
  quote, which the checklist did not.
- [Reload-spam burns deck entries] → Accepted; each reload costs the full
  countdown and shows a different quote — no advantage gained, no state
  corrupted.
