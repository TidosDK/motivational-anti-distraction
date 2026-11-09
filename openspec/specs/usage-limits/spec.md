# usage-limits Specification

## Purpose

Defines the daily budget model: how time on blocked sites is counted, the
per-site and combined daily limits, the configurable daily reset boundary,
and when a site is considered exhausted.

Counting is deliberately generous: a window fully covered by another window
on the same monitor is indistinguishable from a visible one via browser APIs
and therefore counts as visible, and system screen-lock is not detected. Both
are accepted limitations.

## Requirements

### Requirement: Foreground-only time accounting
The system SHALL count usage time for a blocked site while a tab of that site
is the active tab of **any visible browser window** — a window in normal,
maximized, or fullscreen state, on any monitor, whether or not it has keyboard
focus. Time in background (non-active) tabs and in minimized or hidden windows
MUST NOT be counted. A domain that is the active tab of two or more visible
windows at once SHALL still accrue at most once per second of wall-clock time.

#### Scenario: Background tab does not accrue
- **WHEN** a YouTube tab is open but the user is active in another tab
- **THEN** YouTube usage time does not increase

#### Scenario: Foreground tab accrues
- **WHEN** a YouTube tab is the active tab of a visible window for 10 minutes
- **THEN** YouTube usage for the day increases by approximately 10 minutes

#### Scenario: Unfocused window on a second monitor accrues
- **WHEN** YouTube is the active tab of a visible window on monitor two while the user types in a different window on monitor one
- **THEN** YouTube usage keeps increasing at real time

#### Scenario: Minimized window stops the clock
- **WHEN** the only YouTube window is minimized and later restored
- **THEN** usage stops accruing while minimized and resumes after restore

#### Scenario: Same domain in two windows counts once
- **WHEN** two visible windows each show YouTube as their active tab for 10 minutes
- **THEN** YouTube usage for the day increases by approximately 10 minutes, not 20

### Requirement: Per-site daily limit
The user SHALL be able to set a daily time limit in minutes for each blocked
site (e.g. 60 for YouTube, 30 for Instagram). When a site's accumulated usage
for the current usage day reaches its limit, that site SHALL become exhausted.
A site with no explicit limit SHALL be governed only by the combined budget.

#### Scenario: Site limit reached
- **WHEN** Instagram's limit is 30 minutes and its usage for the day reaches 30 minutes
- **THEN** Instagram becomes exhausted and is blocked, while other sites with remaining time still load

### Requirement: Combined daily budget
The user SHALL be able to set a combined daily budget of total time across all
blocked sites (e.g. 120 minutes). When accumulated usage across all blocked
sites reaches the budget, ALL blocked sites SHALL become exhausted regardless
of their individual meters.

#### Scenario: Combined budget reached before site limits
- **WHEN** the combined budget is 120 minutes and total usage across sites reaches 120 while YouTube has used only 50 of its 60 minutes
- **THEN** YouTube is blocked despite its own meter not being exhausted

#### Scenario: Overlap counts once
- **WHEN** the user uses YouTube for 40 minutes in a day
- **THEN** the 40 minutes count against both YouTube's meter and the combined budget exactly once

### Requirement: Configurable daily reset
The system SHALL reset all daily counters — per-site meters, combined budget,
and day-pass counts — at a user-configurable local wall-clock time, defaulting
to 05:00. Usage before the reset time but after midnight MUST be attributed to
the previous usage day.

#### Scenario: Night-owl session attribution
- **WHEN** the reset time is 05:00 and the user watches YouTube at 01:30 local time
- **THEN** that usage counts toward the day that ends at the upcoming 05:00 reset, not the new day

#### Scenario: Reset restores state
- **WHEN** the daily reset time passes
- **THEN** every site's meter, the combined budget, and all day-pass counts start fresh, and previously exhausted sites are accessible again

### Requirement: Usage while exempt
While a day-pass session is active for a site, the system SHALL continue to
record usage of that site for statistics, but that usage MUST NOT trigger
blocking or re-exhaustion of that site until the session ends. When the
session ends (elapsed or reset), normal exhaustion rules apply again.

#### Scenario: Exempt usage tracked but harmless
- **WHEN** YouTube is open under an active day-pass session and the user spends the session's full duration on it
- **THEN** that usage appears in the day's statistics, and YouTube stays accessible until the session ends, at which point it re-blocks if still exhausted
