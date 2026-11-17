# Spec Delta

## ADDED Requirements

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
