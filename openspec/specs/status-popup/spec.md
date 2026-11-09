# status-popup Specification

## Purpose

Defines the toolbar-action popup: a glanceable, read-only summary of how much
blocked-site time remains today, per site and combined, plus an entry point
to the options page.

## Requirements

### Requirement: Toolbar popup shows remaining time
The system SHALL open a popup when the extension's toolbar icon is clicked.
The popup SHALL list every blocked site configured in settings with its
remaining time for the current usage day — the site's daily limit minus time
used today, floored at zero — formatted as a human-readable duration.

#### Scenario: Site with time left
- **WHEN** the popup is opened and youtube.com has a 60-minute limit with 20 minutes used today
- **THEN** the popup shows youtube.com with about 40m remaining

#### Scenario: Exhausted site
- **WHEN** the popup is opened and youtube.com's limit is fully used
- **THEN** youtube.com is shown with zero remaining / exhausted, not hidden

#### Scenario: Site with no per-site limit
- **WHEN** the popup is opened and a blocked site has no per-site daily limit
- **THEN** that site is listed as governed only by the combined budget rather than showing a fake remaining figure

### Requirement: Popup shows combined budget remaining
The popup SHALL show the remaining time of the combined budget for the
current usage day (budget minus total time across all blocked sites, floored
at zero), and the time at which the usage day resets.

#### Scenario: Combined remaining
- **WHEN** the combined budget is 120 minutes and 90 minutes total were used across all blocked sites
- **THEN** the popup shows about 30m remaining for the combined budget

#### Scenario: Reset time visible
- **WHEN** the popup is opened
- **THEN** the popup states when the usage day resets (the configured reset hour)

### Requirement: Popup reflects current state
The popup SHALL reflect the current usage day when opened — including a day
that rolled over while the browser was running — and SHALL update while open
as usage accrues or settings change.

#### Scenario: Day rolled over
- **WHEN** the usage-day reset passed since the last activity and the popup is opened
- **THEN** the popup shows the new usage day (full remaining budgets), not yesterday's spent ones

#### Scenario: Live update while open
- **WHEN** the popup is open and usage accrues on a blocked site (e.g. that site is active in a window)
- **THEN** the remaining time in the popup decreases without reopening it

### Requirement: Popup shows the installed version
The popup SHALL display the installed extension's version, matching the
version the browser shows for the extension.

#### Scenario: Version visible
- **WHEN** the popup is opened
- **THEN** the popup shows the extension's current version string

### Requirement: Popup links to the options and stats pages
The popup SHALL provide a control that opens the extension's options page and
a control that opens the extension's stats page.

#### Scenario: Open settings
- **WHEN** the user activates the options link in the popup
- **THEN** the options page opens

#### Scenario: Open stats
- **WHEN** the user activates the stats link in the popup
- **THEN** the stats page opens

### Requirement: Popup is read-only with an empty state
Opening and viewing the popup SHALL NOT change budgets, usage counters,
passes, or settings. With no blocked sites configured, the popup SHALL say so
and still offer the options link.

#### Scenario: Nothing configured yet
- **WHEN** the popup is opened and no sites are blocked
- **THEN** the popup states that no sites are blocked yet and offers the options link
