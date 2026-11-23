# override-ritual Specification

## Purpose

Defines the unlock ceremony for blocked sites. The user types a quote from
their effective deck while a 30-second countdown runs. The day-pass allowance
determines how often the ceremony can open each site.

## Requirements

### Requirement: Unlock ceremony
The interstitial SHALL show the full quote from the effective deck with
live feedback on correct characters and typos. A visible countdown of at
least 30 seconds SHALL start when the quote appears. Quick Override SHALL
stay disabled until the countdown elapses and the full input matches the
displayed quote, including capitalization, punctuation, and spacing.

#### Scenario: Button locked during countdown
- **WHEN** the interstitial has been displayed for 10 seconds and the full
  quote is already typed correctly
- **THEN** the Quick Override button remains disabled

#### Scenario: Button locked without full checklist
- **WHEN** the countdown has fully elapsed but the typed quote is incomplete
  or contains an error
- **THEN** the Quick Override button remains disabled

#### Scenario: Override unlocks
- **WHEN** the countdown has fully elapsed and the full quote is typed
  correctly and the user activates Quick Override
- **THEN** a day-pass is spent and the blocked site becomes accessible

#### Scenario: Reload restarts countdown
- **WHEN** the user reloads the interstitial before the countdown completes
- **THEN** the countdown starts again from the full duration (and the reload
  draws the next quote from the deck, like any fresh ceremony load)

#### Scenario: Typing feedback follows corrections
- **WHEN** the user types a wrong character and corrects it
- **THEN** the quote marks that character as a typo and clears the mark after correction

#### Scenario: Type punctuation on a standard keyboard
- **WHEN** the source quote contains curly quotation marks, a long dash, or an ellipsis
- **THEN** the prompt displays keyboard-friendly punctuation that can be typed as shown

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
The effective deck SHALL mix bundled and user-added quotes. The user SHALL
be able to add quotes and restrict the deck to their own quotes. An empty
personal-only deck SHALL fall back to bundled quotes. Each quote SHALL be
shown once in random order before the deck reshuffles. The deck state SHALL
persist across browser sessions. Editing the deck MAY restart the cycle.
Quote selection MUST work offline.

#### Scenario: No repeat within a full cycle
- **WHEN** the user sees consecutive ceremony quotes from an effective deck
  of 50
- **THEN** no quote appears twice within that cycle

#### Scenario: Deck survives restart
- **WHEN** the browser restarts mid-deck and another ceremony occurs
- **THEN** the next quote still respects the no-repeat rule of the current
  cycle

#### Scenario: User quote joins the deck
- **WHEN** the user adds a quote to the deck
- **THEN** it is shuffled into the cycle like any bundled quote and is shown
  at most once per cycle

#### Scenario: Own-quotes-only mode
- **WHEN** the user enables own-quotes-only and has added at least one quote
- **THEN** ceremonies draw exclusively from the user's quotes

#### Scenario: Own-only with no quotes falls back
- **WHEN** own-quotes-only is enabled but the user has added no quotes
- **THEN** ceremonies draw from the bundled deck rather than showing nothing

### Requirement: Recent-passes line
When the user has spent day-passes on the blocked site within the previous
7 usage days (including today), the ceremony SHALL display one factual line
stating that count for this site. With zero passes in that window the line
MUST NOT be shown. The line SHALL state the measured count only — no
judgmental or shaming framing.

#### Scenario: Honest reminder
- **WHEN** the user has spent 3 day-passes on youtube.com in the last 7
  usage days and a youtube.com ceremony is shown
- **THEN** the ceremony includes a factual line noting the 3 passes in the
  last 7 days

#### Scenario: First ceremony of the week
- **WHEN** the site has no spent passes in the previous 7 usage days
- **THEN** no recent-passes line is shown
