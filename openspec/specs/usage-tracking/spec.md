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
The system SHALL retain at least 30 usage days of history. Older days MAY be
pruned automatically.

#### Scenario: History retained
- **WHEN** 30 usage days have passed since a day with recorded usage
- **THEN** that day is still visible in the stats page
