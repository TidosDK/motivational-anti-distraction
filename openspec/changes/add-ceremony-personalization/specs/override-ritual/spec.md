# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Unlock ceremony
The interstitial SHALL show a quote from the effective deck with exactly one
word blanked. The background SHALL choose the blank and its expected answer.
A visible countdown of at least 30 seconds SHALL run from the display of the
quote. Quick Override SHALL stay disabled until the countdown elapses and
the user types the missing word correctly, ignoring case and whitespace at
the ends of the answer.

#### Scenario: Button locked during countdown
- **WHEN** the interstitial has been displayed for 10 seconds and the blanked
  word is already typed correctly
- **THEN** the Quick Override button remains disabled

#### Scenario: Button locked without full checklist
- **WHEN** the countdown has fully elapsed but the blanked word is not yet
  filled in correctly
- **THEN** the Quick Override button remains disabled

#### Scenario: Override unlocks
- **WHEN** the countdown has fully elapsed and the blanked word is typed
  correctly and the user activates Quick Override
- **THEN** a day-pass is spent and the blocked site becomes accessible

#### Scenario: Reload restarts countdown
- **WHEN** the user reloads the interstitial before the countdown completes
- **THEN** the countdown starts again from the full duration (and the reload
  draws the next quote from the deck, like any fresh ceremony load)

#### Scenario: Blank a meaningful word
- **WHEN** a ceremony displays a quote
- **THEN** exactly one word of that quote is blanked (the longest word,
  preferring words of at least 4 characters) and the rest of the quote
  remains readable

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

## REMOVED Requirements

### Requirement: Fixed confession checklist
**Reason**: replaced by the always-active fill-in-the-blank task. Passive
checkbox ticking invited muscle-memory overrides; typing a word from the
displayed quote forces reading it. Ruled out deliberately: keeping the
checklist alongside the blank was considered and rejected.
**Migration**: none — the checklist stored no user data; the day-pass
economy and countdown rules are untouched.
