# Proposal

## Why

The ceremony is the product — and right now it habituates: four confession
checkboxes get ticked on muscle memory within a week, and stock quotes rarely
say anything personal. Three small upgrades keep the ceremony attention-worthy
without touching the day-pass economy, all local with no new permissions:
(a) the checklist is replaced by typing the full displayed quote with live
character feedback; (b) your own quotes, optionally replacing the bundled deck
entirely; (c) one factual line recalling how often this site already cost a
ceremony this week.

## What Changes

- **Quote typing** shows the whole quote and highlights correct characters
  and typos as the user types. Quick Override unlocks after both the full
  quote matches and the countdown finishes.
- **User quote deck**: users add their own quotes (optionally own-quotes-only
  mode); the existing shuffle-cycling applies to the effective deck. Draw
  semantics are unchanged: each interstitial load draws the next deck entry,
  and each reload restarts the full countdown.
- **Recent-passes line**: the ceremony states factually how many day-passes
  this site cost in the last 7 usage days (hidden at zero).
- Out of scope: rotating task types, "future-me" dated self-messages,
  per-site confessions, and escalating lockout.

## Capabilities

### New Capabilities

<!-- None: all of this modifies the ceremony, which override-ritual owns. -->

### Modified Capabilities

- `override-ritual` requires the full quote and countdown for unlock, removes
  the fixed checklist, applies the no-repeat cycle to the effective deck,
  and adds the recent-passes line.
- `usage-tracking` records a completed ceremony while preserving the existing
  override history field.
- `data-portability` includes personal quotes and their preference in JSON
  backup and restores older backups without a personal deck.

## Impact

- `src/pages/interstitial/main.ts` + `interstitial.html` — quote typing and
  live character feedback, plus the recent-passes line.
- `src/background/index.ts` — `nextQuote` returns the full quote and its
  attribution. `siteStatus` gains `passesLast7Days`.
- `src/shared/storage.ts` / `types.ts` / `deck.ts` usage — new `userQuotes`
  key (`quotes: string[]`, `ownOnly: boolean`); the deck operates on the
  effective deck (deck.ts itself already rebuilds on length change).
- `src/pages/options/main.ts` + `options.html` — quotes editor.
- `src/shared/backup.ts` — exports the `userQuotes` section. Older imports
  without it use an empty personal deck and the mixed-deck preference.
- README Features + `docs/testing.md` + one e2e verification script.
