# Proposal

## Why

I lose productive time to distraction sites (YouTube, Instagram, Facebook, ...),
and pure blockers are easy to hate and easy to disable. This extension combines
blocking, a motivational nudge ritual, and honest usage tracking so that access
to these sites becomes a deliberate, friction-full decision instead of an
autopilot reflex — capped at a fixed amount of unproductive time per day.

## What Changes

- New Chrome (Manifest V3, Brave-compatible) extension that blocks a
  user-configured list of distraction websites.
- Time on each blocked site is tracked while its tab is the active tab of any
  visible browser window (multi-monitor aware); background tabs and minimized
  windows do not count.
  Each site can have its own daily time limit; additionally a combined daily
  "unproductive time" budget applies across all listed sites together
  (e.g. YouTube 1h, Instagram 30m, Facebook 15m, combined 2h).
- The usage day resets at a configurable hour (default 05:00 local time) so
  night-owl work sessions belong to the previous day.
- When a limit is exhausted, the site is replaced by a full-tab interstitial
  containing a motivational quote (drawn from a bundled local deck, shuffle
  cycled, no repeats until the deck is exhausted) and a mandatory 30-second
  lockout that runs while the quote is displayed.
- After the lockout, a "Quick Override" button becomes enabled, but only once
  the user has ticked a fixed list of confession checkboxes (e.g. "This is for
  work", "I am NOT slacking off right now!"). All boxes must be checked.
- Each site has a configurable number of day-passes per day (default 1).
  Spending a pass opens THAT site for a short configurable session (default
  10 minutes), bypassing both its own meter and the combined budget. Usage
  keeps being tracked during the session; afterwards the site re-blocks if
  its budgets are still spent. When a site's passes are exhausted, the block
  is hard until reset.
- A stats page shows per-site and total daily usage, override/confession
  events, and at least the last 7 days of history.

## Capabilities

### New Capabilities

- `site-blocking`: Enforcing access to the configured site list — detecting
  navigation to blocked sites, showing the interstitial, and honoring active
  day-passes and remaining limits.
- `usage-limits`: The daily budget model — per-site limits, combined budget,
  foreground-only time accounting, configurable daily reset hour, and when a
  site counts as "exhausted".
- `override-ritual`: The unlock ceremony — quote deck with shuffle-cycled no
  repeats, concurrent 30-second lockout, fixed confession checkboxes, and the
  per-site day-pass economy (configurable N, spend semantics, expiry at reset).
- `usage-tracking`: Recording per-site usage and override events per usage day
  and presenting them (today, last 7 days, per-site + total) in a stats page.

### Modified Capabilities

(None — greenfield project, no existing specs.)

## Impact

- New codebase: Manifest V3 extension (service worker, content script or
  declarativeNetRequest redirect for blocking, options page, interstitial page,
  stats page).
- Permissions (expected): `storage`, `tabs` (foreground tracking),
  `declarativeNetRequest` or webNavigation + host permissions for blocked
  sites. No network calls; quote deck bundled locally.
- Storage: `chrome.storage.local` for settings, daily usage records, quote
  deck position, and day-pass state.
- No external services or accounts; fully offline.
