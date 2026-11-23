# Spec Delta

## Purpose

Defines the toolbar badge for the current tab and the red icon shown when
the applicable daily budget runs out.

## ADDED Requirements

### Requirement: Badge shows remaining time for the current tab
On a configured site with a daily limit, the badge SHALL show the smaller
of that site's remaining time and the combined remaining time. The site's
blocking page SHALL use the same calculation. Other tabs SHALL have an empty
badge. Text SHALL fit in three characters or fewer and show whole minutes
with an `m` suffix up to `99m`, then whole hours, capped at `9h+` from 10 hours.

#### Scenario: Plenty of time left
- **WHEN** the combined budget has 2 hours 30 minutes left today
- **AND** the current site has a limit with at least 2 hours 30 minutes left
- **THEN** the badge shows `2h`

#### Scenario: An individual site has less time left
- **WHEN** the current site has 5 minutes left and the combined budget has 40 minutes left
- **THEN** the badge shows `5m`

#### Scenario: Under an hour left
- **WHEN** the current site has an individual limit and 17 minutes of usable time remain
- **THEN** the badge shows `17m`

#### Scenario: No individual site limit
- **WHEN** the current tab is outside the block list or its site uses only the combined budget
- **THEN** the badge shows no text and the icon uses its normal color

#### Scenario: No sites blocked
- **WHEN** no sites are configured on the block list
- **THEN** the badge shows no text

### Requirement: Over-budget state is unmistakable
On a tab eligible for a badge, zero remaining time SHALL display `0` and
turn the icon red. When the badge is hidden or time is available, the icon
SHALL use its normal color.

#### Scenario: Budget spent
- **WHEN** the combined total used today reaches the combined budget on a tab eligible for a badge
- **THEN** the badge shows 0 and the icon turns red

#### Scenario: Site limit spent before the combined budget
- **WHEN** the current site's limit is used up and combined time remains
- **THEN** the badge shows `0` and the icon turns red on that site and its blocking page

#### Scenario: New day forgives
- **WHEN** the usage day rolls over after being over budget
- **THEN** the badge shows the new day's remaining time and the icon is no
  longer red

### Requirement: Status is always current
The badge and icon SHALL reflect the usage day, settings, and active tab in
each window. They MUST update on tab switches and navigation, and within
about a minute of usage, settings changes, or day reset. Browser startup
MUST recompute the badge and icon.

#### Scenario: Switch to an unrestricted tab
- **WHEN** the user switches from a site with its own limit to another tab without one
- **THEN** the badge clears and the icon uses its normal color

#### Scenario: Stale badge after restart
- **WHEN** the browser is restarted while the badge shows a number from
  before the last usage-day reset
- **THEN** shortly after startup the badge shows the current usage day's
  remaining time

#### Scenario: Budget raised while over
- **WHEN** the user raises the combined budget above today's usage and the current limited site has time left
- **THEN** within about a minute the badge shows the new remaining time and
  the icon is no longer red

### Requirement: Status display is read-only
Viewing the badge or icon state SHALL NOT change budgets, usage, passes, or
settings, and the badge MUST NOT be used as an interactive control.

#### Scenario: Click behavior unchanged
- **WHEN** the user clicks the toolbar icon while a badge is shown
- **THEN** the normal popup opens and no state changes beyond what the
  popup already does
