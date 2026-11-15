# Proposal

## Why

The stats page shows a flat list of days, which answers "what did I do
Tuesday?" but not the two questions that actually create honesty pressure:
"what is my pattern?" (a calendar heatmap answers it instantly) and "do I
ever win?" (an under-budget streak). Meanwhile all totals are windowed to
the recent 31 days, so there is no sense of the whole arc. All three
features derive from data already recorded — the work is presentation and
retention, not new tracking.

## What Changes

- **Calendar heatmap** on the stats page: one cell per usage day over the
  retained history, visual intensity by unproductive minutes, exact value
  on hover.
- **Under-budget streaks**: current and best run of consecutive usage days
  that stayed inside every budget — a record, not a score: losing a streak
  changes nothing about budgets, passes, or ceremony.
- **Lifetime totals**: total tracked time and total overrides/ceremonies,
  computed over the (now year-long) retained window plus a
  "using since install" day count — honest measurable numbers only, no
  invented "hours you would have wasted" estimates.
- **Retention raised** from 31 to 370+ usage days (a year of daily records
  is a few KB; the 30-day spec floor is kept as a floor, not a target).
- No new permissions, no network, no new stored counters.

## Capabilities

### New Capabilities

<!-- None: these are views over recorded history, and the usage-tracking
capability already owns "presents that history honestly". -->

### Modified Capabilities

- `usage-tracking`: adds requirements for the calendar heatmap, the
  under-budget streak, and lifetime totals; modifies Retention to retain at
  least 370 usage days (the 30-day minimum becomes a floor beneath it).

## Impact

- `src/shared/storage.ts` — `pruneHistory` keep-days raised (single
  constant).
- `src/shared/stats.ts` — pure projections: heatmap cells, streak
  computation, lifetime totals; unit-tested.
- `src/pages/stats/main.ts` + `src/shared/style.css` — grid rendering,
  hover values, streak and totals rows.
- README feature list + `docs/testing.md`; one e2e verification script.
- No manifest, permission, or schema-version change (history shape is
  unchanged; old installs simply accumulate longer history after update).
