# Design

## Context

See proposal.md — Why. History is a `Record<"YYYY-MM-DD", DayRecord>`
pruned to 31 days (`pruneHistory`, src/shared/storage.ts). Views are built
by pure functions over storage data (`buildStatsView`, `buildPopupView`)
and pages re-render on `chrome.storage.onChanged`. Reports read settings,
current usage, history, and install metadata together under the existing
storage lock.

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
`pruneHistory` keeps the newest 370 recorded days. The report spans the
oldest retained record through the current usage day, including days with no
record inside that span. A year of daily records fits within the existing
storage quota.

### D2: Derive everything at render; store no new aggregates
Heatmap cells, streak lengths, and totals are pure projections
(`buildHistoryViews(history, settings, state, now, installTs)` in
shared/stats.ts). Alternative — incrementing lifetime counters inside
`loadState` — rejected: multi-context concurrent rolls would double-count,
and the fix (a serialized fold) adds state that itself needs migration.
With 370-day retention the "lifetime" figure is honest as a **windowed**
number labeled with its date range. Install age is a separate value for the
current browser profile.

### D3: `installTs` recorded once, seeded from oldest history
New tiny storage key (e.g. `meta`). At worker init (post-`ready`), if
`installTs` is missing it is written once: the **oldest recorded history
day** when history exists (existing installs get a near-true day count
instead of "since the update"), else "now". The stats page labels ages
seeded from history as estimates. The worker initializes this key once, and
it survives history pruning.

### D4: Streak semantics: inside-budget = within every currently configured
budget, counted from the first recorded usage day; days with no record
inside that span count as inside-budget (zero usage). Judged against
current settings, so raising/lowering a budget retroactively re-scores
history — accepted (honesty about method beats fake snapshots), and the
stats row states "vs current budgets" in its tooltip.

### D5: Heatmap is a CSS grid, intensity buckets relative to the combined budget
Zero has an empty-colored cell. The five positive bands are ≤25%, ≤50%,
≤75%, ≤100%, and >100% of the combined budget. Native
`title` attributes carry the date and measured minutes (plus
`aria-label`); no chart library (zero-deps policy). Weeks as columns,
7 rows; horizontally scrollable when full.

## Risks / Trade-offs

- [Retroactively re-scored streaks after budget edits] → Accepted and
  surfaced in UI wording ("current budgets"); snapshotting budgets per day
  would require history-shape growth for marginal honesty gain.
- [370-day grid is wide] → Horizontal scroll, with weekday labels held in view.
- [Zero-usage days before a user's real start inflate early streaks] →
  Bounded by the first recorded day (D4). An unused profile starts with a
  streak of zero.
