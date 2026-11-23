# Spec Delta

## ADDED Requirements

### Requirement: Weekly usage chart
The stats view SHALL show daily combined usage as bars with a combined-budget
reference line. It SHALL open on the latest seven usage days and allow
navigation to older weeks in the retained period. Bars SHALL use red only when
actual usage exceeds the combined budget. Selecting a day SHALL show its
date, usage rounded to whole minutes in hours and minutes, and budget status.
The chart SHALL include zero-usage days inside the retained period and SHALL
be informational only.

#### Scenario: Compare a week of usage
- **WHEN** the user opens Stats with at least seven days in the report
- **THEN** the latest seven usage days appear as bars with the combined budget marked

#### Scenario: Usage details on demand
- **WHEN** the user selects a day in the chart
- **THEN** the chart shows the date, rounded combined usage, and any exceeded limits

#### Scenario: Inspect older days
- **WHEN** retained usage predates the displayed week and the user goes back a week
- **THEN** the previous seven-day period is shown, including quiet days

### Requirement: Website usage for the selected day
The stats view SHALL show a website breakdown for the selected chart day
below the streaks and totals. It SHALL list sites with positive tracked time
from most to least used, showing hours and minutes and each site's percentage
of the selected day's total tracked website time.

#### Scenario: Inspect website usage
- **WHEN** the user selects a day with 32 minutes on one site, 8 minutes on another, and zero minutes on a third
- **THEN** the breakdown shows 32m and 80% first, then 8m and 20%, and omits the third site

#### Scenario: Select a quiet day
- **WHEN** the user selects a day with no tracked website time
- **THEN** the breakdown shows an empty state with no website rows

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
Each row in Recent days SHALL distinguish between days within all limits,
days over the combined budget, and days over a site limit only. Only combined
budget overages SHALL use red. The label SHALL be readable without relying on color.

#### Scenario: An individual site exceeded its limit
- **WHEN** a recorded day exceeded a site limit while staying within the combined budget
- **THEN** its Recent days row shows a neutral site-limit label and names the site on inspection

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
