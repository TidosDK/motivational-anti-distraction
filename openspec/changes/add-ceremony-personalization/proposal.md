# Proposal

## Why

The ceremony is the product — and right now it habituates: four confession
checkboxes get ticked on muscle memory within a week, and stock quotes rarely
say anything personal. Three small upgrades keep the ceremony attention-worthy
without touching the day-pass economy, all local with no new permissions:
(a) the passive checklist is replaced by one active task that is **always**
fill-in-the-blank from the displayed quote — you must read the quote to type
the missing word; (b) your own quotes, optionally replacing the bundled deck
entirely; (c) one factual line recalling how often this site already cost a
ceremony this week.

## What Changes

- **Fill-in-the-blank replaces the checklist**: every ceremony blanks one word
  of the shown quote (chosen by the background so the page's markup doesn't
  leak it); the Quick Override button unlocks only when the countdown has
  fully elapsed AND the blanked word is typed correctly. The fixed confession
  checklist is **removed** from the product (deliberate spec amendment —
  ruled out in favor of the always-active task).
- **User quote deck**: users add their own quotes (optionally own-quotes-only
  mode); the existing shuffle-cycling applies to the effective deck. Draw
  semantics are unchanged: each interstitial load draws the next deck entry,
  and each reload restarts the full countdown.
- **Recent-passes line**: the ceremony states factually how many day-passes
  this site cost in the last 7 usage days (hidden at zero).
- Out of scope (ruled out or deferred): rotating task types (always
  fill-in-the-blank instead), "future-me" dated self-messages, per-site
  confessions, escalating lockout.

## Capabilities

### New Capabilities

<!-- None: all of this modifies the ceremony, which override-ritual owns. -->

### Modified Capabilities

- `override-ritual`: the Unlock ceremony requirement now gates on the
  fill-in-the-blank word (countdown rules unchanged); the Fixed confession
  checklist requirement is removed; the No-repeat quote deck requirement
  covers the user's effective deck; a new requirement adds the factual
  recent-passes line.
- `usage-tracking` records a completed ceremony while preserving the existing
  override history field.
- `data-portability` includes personal quotes and their preference in JSON
  backup and restores older backups without a personal deck.

## Impact

- `src/pages/interstitial/main.ts` + `interstitial.html` — fill-in-the-blank
  input replaces the confession checkboxes; recent-passes line.
- `src/background/index.ts` — the `nextQuote` response carries the blanked
  text and expected word; `siteStatus` gains `passesLast7Days`.
- `src/shared/storage.ts` / `types.ts` / `deck.ts` usage — new `userQuotes`
  key (`quotes: string[]`, `ownOnly: boolean`); the deck operates on the
  effective deck (deck.ts itself already rebuilds on length change).
- `src/pages/options/main.ts` + `options.html` — quotes editor.
- `src/shared/backup.ts` — exports the `userQuotes` section. Older imports
  without it use an empty personal deck and the mixed-deck preference.
- README Features + `docs/testing.md` + one e2e verification script.
