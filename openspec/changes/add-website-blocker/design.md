# Design

## Context

Greenfield repo; see proposal.md for motivation. Target is Chromium desktop
(Chrome + Brave) with Manifest V3. Fully offline, single user, all state in
the browser.

## Goals / Non-Goals

**Goals:**
- Small, boring codebase: one service worker, three extension pages, no backend
- Correct day-boundary math (05:00 reset) applied uniformly everywhere
- Blocking that never leaks the blocked site's content

**Non-Goals:**
- Anti-forensics against a determined user (uninstalling, new profile) — this
  is a friction device, not a prison
- Firefox/mobile, sync across devices, video content (future change),
  embedded iframes of blocked sites (main-frame blocking only)

## Decisions

### D1: Manifest V3, vanilla TypeScript, Vite — no UI framework
Three static pages (options, interstitial, stats) don't justify React. Vite
builds the pages + service worker with a small config. Alternatives: WXT
(nice DX, extra dependency, not needed for 3 pages); plain JS no-build
(attractive but TS catches real bugs in the day-math/storage code).

### D2: Blocking via declarativeNetRequest session rules
One dynamic session rule per blocked domain: `main_frame` requests matching
`*://<domain>/*` (and subdomains) redirect to
`interstitial.html?s=<domain>`. The service worker recomputes the rule set on
every state change (limit hit, pass spent, reset, settings change) — rule
present ⇔ site exhausted without an active pass. dNR redirects happen before
any bytes of the site load (no flicker/content leak, unlike
`webNavigation` + `tabs.update`, which can flash the real page first), and
Brave fully supports dNR.

### D3: Foreground usage via tab events + 1-minute safety alarm
Usage sessions open when a blocked site becomes the active tab of the focused
window (`tabs.onActivated` / `tabs.onUpdated` / `windows.onFocusChanged`
close the previous session with timestamps). Because MV3 service workers die
when idle, a `chrome.alarms` tick (1 min, only while a blocked site has
focus) flushes accrued seconds to storage, bounding lost data to ~1 minute if
the worker or browser dies. Alternative (pure event accounting, no alarms)
loses the tail of an unclosed session on crashes; a per-second poll is wasteful.

### D4: One source of truth for the usage day
A single helper pair — `usageDayStart(now, resetHour)` / `nextReset(...)` —
defines the day as `[resetHour, next resetHour)`. Every counter, record key,
pass expiry, and stats bucket derives from it. All state resets are computed
lazily from timestamps (compare stored `dayStart` vs current) rather than
depending on an alarm firing exactly at 05:00; an alarm exists only to update
dNR rules promptly at the boundary.

### D5: Storage model (`chrome.storage.local`)
- `settings`: `{ sites: [{ domain, limitMin | null, passes: n }], combinedBudgetMin, resetHour }`
- `state`: `{ dayStart, perSiteSeconds: {domain: s}, passesActive: {domain: true}, passesUsed: {domain: n} }` — keyed to `dayStart`; on read, if `dayStart` is stale, roll to the new day first
- `history`: `{ "YYYY-MM-DD": { perSite: {...}, totalSec, overrides: [{site, ts, affirmed: true}] } }` (retain 30 days)
- `deck`: `{ cycleOrder: number[], position: n }`

### D6: Quote deck
~200 quotes bundled as a TS module. Shuffle-cycling: on exhaustion of the
cycle, reshuffle; persist `{cycleOrder, position}` so restarts don't repeat.

## Risks / Trade-offs

- [Service worker killed with an open session] → alarm tick caps loss at ~1
  minute; timestamps make most accounting event-exact anyway
- [User opens devtools/other trick to bypass] → out of scope by design; the
  30s + confessions target autopilot, not adversarial self
- [Interstitial reload to "reset" the quote] → countdown restarts on reload
  (spec), so reloading only adds friction; deck position only advances on a
  completed display
- [dNR rule sync bug leaves a site unblocked] → recompute-and-diff rule set
  on every state change and on startup; add a dev-only debug page
- [Brave Shields interfering] → dNR is native; verify during manual testing
  in Brave (explicit test task)

## Migration Plan

Greenfield; load unpacked extension during development. Rollback = remove
extension. No data migration concerns; storage schema is versioned with a
`version` field from day one.

## Open Questions

- Exact quote library content (curate ~200 during implementation)
- Whether the toolbar icon badge shows remaining minutes (nice-to-have,
  doesn't affect specs)
