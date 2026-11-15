# Design

## Context

See proposal.md — Why. History is a `Record<"YYYY-MM-DD", DayRecord>`
pruned to 31 days (`pruneHistory`, src/shared/storage.ts). Views are built
by pure functions over storage data (`buildStatsView`, `buildPopupView`)
and pages re-render on `chrome.storage.onChanged`. The known landmine:
`loadState()` performs lazy day-rolls and runs concurrently in every
context (worker, popup, stats), so any mutation-in-loadState pattern
(incrementing counters) races — this design deliberately adds none.

## Goals / Non-Goals

**Goals:**
- All three views derived at render time from retained history — no new
  mutable counters, so no races and nothing to migrate.
- Streak/heatmap framing stays factual (record of what happened, not a
  virtue score).
- Year-long retention at negligible storage cost.

**Non-Goals:**
- No streak persistence, streak rewards, or streak loss mechanics of any
  kind (spec forbids behavioral effects).
- No new storage schema version — history/day records keep their shape.
- No per-site heatmaps (combined minutes only for v1).

## Decisions

### D1: Keep 370 usage days; prune keeps the oldest-out rule
One constant change in `pruneHistory` (31 → 370). A `DayRecord` is ~200–
500 bytes; a year is well under 1 MB against the ~10 MB `storage.local`
quota. No need for the `unlimitedStorage` permission.

### D2: Derive everything at render; store no new aggregates
Heatmap cells, streak lengths, and totals are pure projections
(`buildHistoryViews(history, settings, state, now, installTs)` in
shared/stats.ts). Alternative — incrementing lifetime counters inside
`loadState` — rejected: multi-context concurrent rolls would double-count,
and the fix (a serialized fold) adds state that itself needs migration.
With 370-day retention the "lifetime" figure is honest as a **windowed**
number (spec: label the window) plus an exact days-since-install.

### D3: `installTs` recorded once, seeded from oldest history
New tiny storage key (e.g. `meta`). At worker init (post-`ready`), if
`installTs` is missing it is written once: the **oldest recorded history
day** when history exists (existing installs get a near-true day count
instead of "since the update"), else "now" (genuinely fresh installs).
Read with a tolerant loader; writing happens in the worker only, so the
multi-context race class does not apply. Key survives history pruning by
design.

### D4: Streak semantics: inside-budget = within every currently configured
budget, counted from the first recorded usage day; days with no record
inside that span count as inside-budget (zero usage). Judged against
current settings, so raising/lowering a budget retroactively re-scores
history — accepted (honesty about method beats fake snapshots), and the
stats row states "vs current budgets" in its tooltip.

### D5: Heatmap is a CSS grid, intensity buckets relative to the combined budget
Five buckets: 0, ≤25%, ≤50%, ≤75%, ≤100%, >100% of the combined budget —
personal scale, so a palette change means no palette redesign. Native
`title` attributes carry exact "Sat 15 Nov · 47m" values (plus
`aria-label`); no chart library (zero-deps policy). Weeks as columns,
7 rows; horizontally scrollable when full.

## Risks / Trade-offs

- [Retroactively re-scored streaks after budget edits] → Accepted and
  surfaced in UI wording ("current budgets"); snapshotting budgets per day
  would require history-shape growth for marginal honesty gain.
- [Users who installed before this change get installTs = update day] →
  Documented; the day count is then "using since update", which is still
  truthful for the visible window.
- [370-day grid is wide] → Accepted; scroll + a "months shown" caption.
- [Zero-usage days before a user's real start inflate early streaks] →
  Bounded by first-recorded-day clamping (D4); a user who installs and
  blocks nothing simply has an honest clean streak.
