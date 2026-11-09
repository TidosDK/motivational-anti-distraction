# Spec Delta

## Purpose

Defines the unlock ceremony shown on the interstitial — motivational quote,
fixed confession checkboxes, enforced 30-second lockout — and the day-pass
economy that governs how often the ceremony can actually unlock a site.

## ADDED Requirements

### Requirement: Unlock ceremony
The interstitial SHALL present a single combined ceremony: a motivational
quote, the fixed confession checklist, and a visible countdown of at least 30
seconds that starts when the interstitial is displayed and runs while the
quote is shown. The "Quick Override" button SHALL remain disabled until BOTH
the countdown has fully elapsed AND every checkbox is ticked.

#### Scenario: Button locked during countdown
- **WHEN** the interstitial has been displayed for 10 seconds and all checkboxes are ticked
- **THEN** the Quick Override button remains disabled

#### Scenario: Button locked without full checklist
- **WHEN** the countdown has fully elapsed but one checkbox is unticked
- **THEN** the Quick Override button remains disabled

#### Scenario: Override unlocks
- **WHEN** the countdown has fully elapsed and all checkboxes are ticked and the user activates Quick Override
- **THEN** a day-pass is spent and the blocked site becomes accessible

#### Scenario: Reload restarts countdown
- **WHEN** the user reloads the interstitial before the countdown completes
- **THEN** the countdown starts again from the full duration

### Requirement: Fixed confession checklist
The ceremony SHALL display a fixed bundled list of confession statements
including at least "This is for work" and "I am NOT slacking off right now!".
The list MUST be identical on every ceremony and every checkbox MUST be
tickable. The user MUST NOT be able to reconfigure or remove the list in this
version.

#### Scenario: Checklist is complete and fixed
- **WHEN** the interstitial is displayed on any site, any day
- **THEN** the same set of confession checkboxes is shown, all requiring a tick

### Requirement: Per-site day-pass allowance
Each blocked site SHALL have a user-configurable number of day-passes per
usage day, defaulting to 1. The interstitial SHALL show how many passes remain
for that site today. The user SHALL be able to configure how long a spent
pass keeps its site open (the "pass session", defaulting to 10 minutes).

#### Scenario: Configure passes
- **WHEN** the user sets YouTube's day-passes to 3
- **THEN** up to 3 override ceremonies can unlock YouTube in one usage day

#### Scenario: Last pass spent
- **WHEN** a site's final remaining day-pass is spent and its session ends
- **THEN** the site stays blocked until the next daily reset and the interstitial offers no override

### Requirement: Day-pass spend semantics
Spending a day-pass SHALL apply to exactly one site and grant access to that
site for a configurable session duration (defaulting to 10 minutes) from the
moment of spending, ending no later than the next daily reset. Passes for
other sites MUST NOT be affected, and unused passes MUST NOT accumulate
across days.

#### Scenario: Pass affects only its site
- **WHEN** the user spends a day-pass on YouTube while Instagram is also blocked
- **THEN** YouTube becomes accessible and Instagram remains blocked

#### Scenario: Pass grants a timed session
- **WHEN** the user spends a pass on YouTube with a 10-minute session and navigates within the session
- **THEN** YouTube loads, and its usage still accrues toward the combined budget for statistics

#### Scenario: Site re-blocks when the session ends
- **WHEN** a YouTube pass session has expired and YouTube's budgets are still exhausted and the user navigates to YouTube
- **THEN** YouTube is redirected to the interstitial again, offering any remaining pass or the hard block

#### Scenario: Session truncated by daily reset
- **WHEN** a pass session would run past the daily reset time
- **THEN** the reset clears the session along with all other daily state, and the site starts the new day accessible

#### Scenario: Passes do not carry over
- **WHEN** the day ends with an unused Instagram pass
- **THEN** after the daily reset the count is back to the configured value, not doubled

### Requirement: No-repeat quote deck
The system SHALL bundle a local library of motivational quotes and select
them by shuffle-cycling: every quote in the deck is shown once (in random
order) before any quote can appear again, then the deck reshuffles. The deck
state MUST persist across sessions, and quote selection MUST NOT require
network access.

#### Scenario: No repeat within a full cycle
- **WHEN** the user sees 50 consecutive ceremony quotes from a deck of 50
- **THEN** no quote appears twice within that cycle

#### Scenario: Deck survives restart
- **WHEN** the browser restarts mid-deck and another ceremony occurs
- **THEN** the next quote still respects the no-repeat rule of the current cycle
