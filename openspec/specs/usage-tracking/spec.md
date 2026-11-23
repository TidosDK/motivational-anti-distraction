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
