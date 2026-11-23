# Spec Delta

## ADDED Requirements

### Requirement: Weekly usage chart
The stats view SHALL show daily combined usage as bars with a combined-budget
reference line. It SHALL open on the latest seven usage days and allow
navigation to older weeks in the retained period. Selecting a day SHALL show
its date, minutes, and budget status. The chart SHALL include zero-usage days
inside the retained period and SHALL be informational only.

#### Scenario: Compare a week of usage
- **WHEN** the user opens Stats with at least seven days in the report
- **THEN** the latest seven usage days appear as bars with the combined budget marked

#### Scenario: Exact value on demand
- **WHEN** the user selects a day in the chart
- **THEN** the chart shows the date, combined minutes, and any exceeded budgets

#### Scenario: Inspect older days
- **WHEN** retained usage predates the displayed week and the user goes back a week
- **THEN** the previous seven-day period is shown, including quiet days

### Requirement: Calendar mode is disabled by default
The extension SHALL retain the calendar heatmap implementation behind a
feature flag with a disabled default.

#### Scenario: Default stats view
- **WHEN** the user opens Stats with the default feature configuration
- **THEN** the weekly chart is shown and the calendar is hidden

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

### Requirement: Recent days shows daily budget status
Each row in Recent days SHALL label the day as within budget or over budget
using the same current combined and per-site limits as the streak calculation.
The label SHALL be readable without relying on color.

#### Scenario: An individual site exceeded its limit
- **WHEN** a recorded day exceeded a site limit while staying within the combined budget
- **THEN** its Recent days row is marked over budget and names the exceeded site on inspection

### Requirement: Lifetime totals
The stats view SHALL show total tracked time and total override ceremonies
over the retained history window with a readable date range in **Total Recorded**.
The Stats footer SHALL show the number of usage days since the extension was
first installed. Displayed figures MUST be measured values;
the system MUST NOT present invented projections (such as "hours you would
otherwise have wasted") as facts, and any estimate shown SHALL be labeled
as an estimate.

#### Scenario: Totals survive pruning
- **WHEN** history older than the retention window has been pruned
- **THEN** the footer still calculates install age from the saved install
  date, and the totals show the date range they cover

#### Scenario: No vanity metrics
- **WHEN** the user reviews the lifetime totals
- **THEN** every number shown is derived from recorded data (or explicitly
  labeled as an estimate)

## MODIFIED Requirements

### Requirement: Retention
The system SHALL retain at least 370 usage days of history so a full year is
available in the stats view and weekly chart. Retaining more is permitted;
older days MAY be pruned automatically. The minimum remains 30 usage days
where storage pressure requires it, in which case the lifetime totals
requirement's window labeling applies.

#### Scenario: A year of history visible
- **WHEN** the user opens the stats page 300 days into using the extension
- **THEN** the daily rows and weekly chart can show records from nearly a year ago

#### Scenario: History retained
- **WHEN** 30 usage days have passed since a day with recorded usage
- **THEN** that day is still visible in the stats page
