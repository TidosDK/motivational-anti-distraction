# Spec Delta

## ADDED Requirements

### Requirement: Calendar heatmap of usage days
The stats view SHALL display a calendar heatmap with one cell per usage day
over the retained history, colored by intensity of that day's combined
unproductive minutes (including zero-minute days, which remain visible as
empty cells). Each cell SHALL expose its exact date and minutes on hover or
equivalent inspection. The heatmap is a factual record: it MUST NOT encode
punishment, shame framing, or any behavioral penalty beyond the data.

#### Scenario: Pattern is visible at a glance
- **WHEN** the user opens the stats page after two months of recorded usage
- **THEN** a calendar grid shows every usage day, with busier days visibly
  darker

#### Scenario: Exact value on demand
- **WHEN** the user inspects a single heatmap cell
- **THEN** the date and that day's combined minutes are shown exactly

#### Scenario: Quiet days are still days
- **WHEN** a recorded usage day has zero unproductive minutes
- **THEN** its cell is present and visibly empty rather than missing

### Requirement: Under-budget streak record
The stats view SHALL show the current and the best streak of consecutive
usage days on which usage stayed within every applicable budget (all
per-site limits and the combined budget, as currently configured), counted
from the first recorded usage day. A day with no recorded usage inside the
retained period counts as inside budget. Streak display SHALL be purely
informational: streak values MUST NOT modify budgets, passes, blocking, or
the ceremony, in the present or the future.

#### Scenario: Streak grows
- **WHEN** the user has stayed inside all budgets for 7 consecutive usage
  days including today
- **THEN** the current streak reads 7

#### Scenario: Streak resets on an over-budget day
- **WHEN** a usage day ends with any budget exceeded
- **THEN** the current streak restarts from zero for the following day and
  the best-streak record is unaffected

#### Scenario: No penalty anywhere
- **WHEN** a streak ends
- **THEN** budgets, passes, and the ceremony behave exactly as on any other
  day

### Requirement: Lifetime totals
The stats view SHALL show total tracked time and total override ceremonies
over the retained history window, plus the number of usage days since the
extension was first installed. Displayed figures MUST be measured values;
the system MUST NOT present invented projections (such as "hours you would
otherwise have wasted") as facts, and any estimate shown SHALL be labeled
as an estimate.

#### Scenario: Totals survive pruning
- **WHEN** history older than the retention window has been pruned
- **THEN** the day count since install remains exact, and the totals are
  labeled with the window they cover

#### Scenario: No vanity metrics
- **WHEN** the user reviews the lifetime totals
- **THEN** every number shown is derived from recorded data (or explicitly
  labeled as an estimate)

## MODIFIED Requirements

### Requirement: Retention
The system SHALL retain at least 370 usage days of history so a full year is
always visible in the stats view and heatmap. Retaining more is permitted;
older days MAY be pruned automatically. The minimum remains 30 usage days
where storage pressure requires it, in which case the lifetime totals
requirement's window labeling applies.

#### Scenario: A year of history visible
- **WHEN** the user opens the stats page 300 days into using the extension
- **THEN** the heatmap shows every recorded usage day, including those from
  nearly a year ago

#### Scenario: History retained
- **WHEN** 30 usage days have passed since a day with recorded usage
- **THEN** that day is still visible in the stats page
