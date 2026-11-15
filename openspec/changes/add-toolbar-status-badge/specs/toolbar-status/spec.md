# Spec Delta

## Purpose

Defines the toolbar icon's ambient status: a badge showing the combined
budget's remaining minutes for the current usage day and a red icon variant
when the budget is spent — glanceable, read-only, and always fresh.

## ADDED Requirements

### Requirement: Badge shows combined remaining time
While at least one site is blocked, the toolbar icon SHALL show a badge with
the combined budget's remaining time for the current usage day, floored at
zero, formatted to fit four characters or fewer (e.g. minutes up to 99, an
`HhMM`-style form up to 9h59, and a capped form beyond that).

#### Scenario: Plenty of time left
- **WHEN** the combined budget has 2 hours 30 minutes left today
- **THEN** the badge shows a remaining-time indication of about 2h30

#### Scenario: Under an hour left
- **WHEN** the combined budget has 47 minutes left today
- **THEN** the badge shows 47

#### Scenario: No sites blocked
- **WHEN** no sites are configured on the block list
- **THEN** the badge shows no text

### Requirement: Over-budget state is unmistakable
When the combined budget is fully used for the current usage day, the badge
SHALL read zero and the toolbar icon SHALL switch to a red variant. When the
budget is no longer exceeded (the day rolled over, the budget was raised, or
a site was removed), the icon SHALL return to its normal color.

#### Scenario: Budget spent
- **WHEN** the combined total used today reaches the combined budget
- **THEN** the badge shows 0 and the icon turns red

#### Scenario: New day forgives
- **WHEN** the usage day rolls over after being over budget
- **THEN** the badge shows the new day's remaining time and the icon is no
  longer red

### Requirement: Status is always current
The badge and icon SHALL reflect the current usage day and settings. They
MUST update within about a minute of usage accruing, of a settings change
that changes the remaining time or over-budget state, and after the usage
day resets. After a browser (re)start, the system MUST recompute the badge
and icon rather than leave values left over from the previous session.

#### Scenario: Stale badge after restart
- **WHEN** the browser is restarted while the badge shows a number from
  before the last usage-day reset
- **THEN** shortly after startup the badge shows the current usage day's
  remaining time

#### Scenario: Budget raised while over
- **WHEN** the user raises the combined budget above today's usage
- **THEN** within about a minute the badge shows the new remaining time and
  the icon is no longer red

### Requirement: Status display is read-only
Viewing the badge or icon state SHALL NOT change budgets, usage, passes, or
settings, and the badge MUST NOT be used as an interactive control.

#### Scenario: Click behavior unchanged
- **WHEN** the user clicks the toolbar icon while a badge is shown
- **THEN** the normal popup opens and no state changes beyond what the
  popup already does
