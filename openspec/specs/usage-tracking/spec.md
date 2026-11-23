# usage-tracking Specification

## Purpose

Records how much time the user actually spends on blocked sites and how often
they override the system, and presents that history honestly so the user can
see the truth about their days.

## Requirements

### Requirement: Daily usage records
The system SHALL record, per usage day (per the configured reset time), the
total time used on each blocked site and the combined total, including time
spent while a day-pass was active. Records MUST persist across browser
restarts.

#### Scenario: Day recorded after use
- **WHEN** the user spends 45 minutes on YouTube and 20 minutes on Instagram in one usage day
- **THEN** that day's record shows 45m for YouTube, 20m for Instagram, and 65m combined

### Requirement: Override event log
The system SHALL record each spent day-pass with the site, the timestamp, and
the fact that the confession checklist was affirmed. The log MUST persist
across browser restarts.

#### Scenario: Override recorded
- **WHEN** the user completes a ceremony and spends a day-pass on YouTube at 14:05
- **THEN** an override entry exists for YouTube at 14:05 marked as affirmed

### Requirement: Stats page
The system SHALL provide a stats view showing, for the current usage day and
for each of the at least 7 most recent usage days: per-site usage, combined
usage, the applicable limits, and any overrides used. A simple list or table
is sufficient.

#### Scenario: Review today
- **WHEN** the user opens the stats page during a usage day
- **THEN** today's per-site and combined usage is shown against the configured limits, with overrides used per site

#### Scenario: Review history
- **WHEN** the user opens the stats page
- **THEN** at least the previous 7 usage days are listed with per-site and combined totals

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
- **THEN** the chart shows the date, rounded combined usage, and a budget status label without listing exceeded sites

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

### Requirement: Away time is not counted
The system SHALL NOT count blocked-site time for periods when the user is
away or the screen is locked. The idle signal is input-based, and passive
watching (a video playing with sound while hands stay off the keyboard) is
counted usage — so the system MUST treat idle as away only while no tab is
playing audible media; a locked session MUST be treated as away regardless
of any playing media. When the system considers the user away, it MUST stop
charging all counted sessions; when the user returns, counting MUST resume
from that moment only. The system MUST NOT charge any part of the away or
locked period to a site's budget or to a usage-day record.

#### Scenario: Hands-off video keeps counting
- **WHEN** a blocked site is playing a video with sound and the user stops
  touching the mouse and keyboard long enough for the browser to report the
  session idle
- **THEN** that site's time keeps counting while the audio plays

#### Scenario: Walk away from a paused video
- **WHEN** a blocked site is the active tab of a visible window, nothing is
  playing audible media, and the user walks away long enough for the browser
  to report the session idle
- **THEN** counting for that site stops and the away period is not charged to
  its budget or to the combined budget

#### Scenario: Silence after the video ends
- **WHEN** the user is idle and the last audible tab stops playing (the video
  ends or is paused)
- **THEN** counting stops from that moment, without waiting for another idle
  event

#### Scenario: Screen locked with browser open
- **WHEN** the screen locks while a blocked site is counted — even while
  media is playing — and the user unlocks the screen 40 minutes later
- **THEN** those 40 minutes are not charged to any site, and counting resumes
  after the unlock

#### Scenario: Idle detected while the worker was asleep
- **WHEN** the service worker wakes (e.g. by a tick alarm) while the user is
  currently away (idle with nothing audible playing, or locked)
- **THEN** no sessions start and any restored session is charged only up to
  the point the worker last saw the user active — the gap while the browser
  considered the user away is not billed

#### Scenario: Return to an active session
- **WHEN** the user returns and the browser reports the session active while a
  blocked site is visible
- **THEN** that site's time starts counting again from the return moment, like
  any other freshly tracked session

### Requirement: Away detection is prompt and best-effort
Idle detection SHALL run at a threshold no longer than 60 seconds, so at most
about one minute of away time is still charged. Where the platform cannot
report screen lock (some Linux desktop environments), the idle detection
MUST still work and lock detection MUST be treated as a best-effort
enhancement, never a correctness dependency.

#### Scenario: Prompt cutoff
- **WHEN** the user becomes away at a blocked tab (idle with nothing audible
  playing, or locked)
- **THEN** counting stops within about one minute of the browser deciding the
  user is idle

#### Scenario: Locked state unavailable
- **WHEN** the platform never reports a locked state
- **THEN** away-time exclusion still functions via the idle signal alone and no feature errors
