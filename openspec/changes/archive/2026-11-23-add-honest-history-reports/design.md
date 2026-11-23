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
- Streak and chart framing stays factual (record of what happened, not a
  virtue score).
- Year-long retention at negligible storage cost.

**Non-Goals:**
- No streak persistence, streak rewards, or streak loss mechanics of any
  kind (spec forbids behavioral effects).
- No new storage schema version — history/day records keep their shape.
- Daily bars represent combined minutes.

## Decisions

### D1: Keep 370 usage days; prune keeps the oldest-out rule
`pruneHistory` keeps the newest 370 recorded days. The report spans the
oldest retained record through the current usage day, including days with no
record inside that span. A year of daily records fits within the existing
storage quota.

### D2: Derive everything at render; store no new aggregates
Daily usage, budget status, streak lengths, and totals are pure projections
(`buildHistoryViews(history, settings, state, now, installTs)` in
shared/stats.ts). Alternative — incrementing lifetime counters inside
`loadState` — rejected: multi-context concurrent rolls would double-count,
and the fix (a serialized fold) adds state that itself needs migration.
**Total Recorded** shows tracked time and override count on one line and the
localized date range beneath it. The Stats footer shows install age for the
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
current settings, so raising or lowering a budget re-scores history. The
**Under-budget Streaks** value explains that comparison in its tooltip.
Recent days can name the sites that exceeded their limits.

### D5: Weekly bars with the budget as a reference
Show the latest seven usage days, with earlier weeks available through
arrow buttons and an enlarged date range between them. The daily average
includes quiet days in the displayed span and uses a smaller, gray label.
Bar height represents combined minutes. The reference line marks the
combined budget. Red bars indicate that actual usage exceeded the combined
budget. Green bars include days that only exceeded a site limit. Selected-day
usage is rounded to whole minutes and shown in hours and minutes. The day
details and Recent days show a gray status label for site-only overages.
The chart uses the combined-budget line and selected-day status to explain
its colors. The calendar remains a disabled display mode.

### D6: Website usage follows the selected day
Place the website list below the streaks and totals so the number of rows
does not affect their position. Rank sites with positive tracked time by
duration. A horizontal bar and a percentage show each site's share of the
sum of the selected day's website times. Current-day figures combine saved
history with live usage, as the chart does. Historical sites remain visible
after removal from settings. Quiet days show a short empty state.

## Risks / Trade-offs

- [Retroactively re-scored streaks after budget edits] → Accepted and
  surfaced in UI wording ("current budgets"); snapshotting budgets per day
  would require history-shape growth for marginal honesty gain.
- [Older history spans many weeks] → Week navigation limits the number of bars shown at once.
- [Zero-usage days before a user's real start inflate early streaks] →
  Bounded by the first recorded day (D4). An unused profile starts with a
  streak of zero.
