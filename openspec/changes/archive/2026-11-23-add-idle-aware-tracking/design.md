# Design

## Context

See proposal.md — Why. The accounting core (src/background/accounting.ts)
already models "stop counting a window" as: close its session, accrue its
segment, drop it from the session map, and clear the tick alarm when no
sessions remain — that is exactly what minimize and tab-close do today
(`dropWindow` + `manageTickAlarm` in src/background/index.ts). Resuming is
equally existing machinery: `init()` re-enumerates every visible window's
active tab and anchors fresh sessions at `now`. The idle work is therefore
mostly event wiring, not new accounting.

## Goals / Non-Goals

**Goals:**
- Treat idle/locked as another trigger for the existing flush-and-clear and
  re-enumerate paths — no new state in storage, no schema change.
- Correctly handle the worker being asleep across the away→active transition
  (MV3 workers die after ~30 s idle; `onStateChanged` events during sleep are
  lost and must not be relied on).

**Non-Goals:**
- No per-monitor or per-window away heuristics (one global idle/lock state).
- No change to how covered-but-visible windows count (still generous; no
  browser API exists for occlusion).
- No new settings (the detection threshold is fixed, not user-configurable).

## Decisions

### D1: Pause = flush + clear sessions; resume = re-enumerate windows
On `chrome.idle.onStateChanged` to `idle` or `locked`: flush and drop every
window session (the `dropWindow` pattern for all windows), clear sessions,
and clear the tick alarm. On `active`: run the same re-enumeration `init()`
performs, anchoring at `now`, and re-arm the tick alarm if anything is
counted. Alternative considered: keep sessions but skip accrual while idle —
rejected because the tick alarm keeps firing during lock and re-anchoring
logic would silently bill segments; clearing the map is the invariant that
already makes minimize/restore correct.

### D2: 15-second detection interval
`chrome.idle.setDetectionInterval(15)` at init and startup. The documented
minimum is 15 s (default 60 s); 15 s caps over-counting at ~a quarter of a
minute per away transition. Not exposed as a setting — one honest constant.

### D3: Query idle state on every worker wake before tracking
`init()` currently starts tracking immediately on wake. With this change it
first awaits `chrome.idle.queryState`: if the result is `idle`/`locked`, it
flushes any restored session segments up to `now`, clears sessions, and skips
re-tracking — the `onStateChanged` to `active` later performs the normal
re-enumeration. This closes the event-loss gap for workers that woke during
a lock via another trigger (alarm, storage change). Alternative: rely on
events alone — rejected; MV3 loses events during worker death, which is the
same race class the `ready` gate already exists to fight.

### D4: `locked` and `idle` share one code path
No separate pause/resume machinery per signal; both flush, both suppress,
both resume via `active` — differing only in the away decision (D5). On
Linux, `locked` comes from the GNOME/KDE DBus screensaver interface with
an X11 fallback (research: Chromium `ui/base/idle`); desktops without those
report only `idle`, which still covers away-time. Nothing may depend on
`locked` specifically.

### D5: Idle pauses only without audible media (validation ruling 2026-11-17)
First Brave validation failed: hands-off YouTube watching under-counted —
`chrome.idle` is purely input-based, so a playing video with no mouse
movement reads as "idle" after the 15 s threshold, while passive watching
is spec'd counted usage (user ruling 2026-11-09, "this is what I want").
Ruled fix: `idle` is treated as away only while `chrome.tabs.query({audible:
true})` finds no playing tab; `locked` is a deliberate departure signal and
pauses even with media playing. When audio stops while idle (video ends),
`tabs.onUpdated` with `changeInfo.audible` re-runs the same decision and
pauses immediately; audio starting while idle (autoplay) resumes tracking.
Accepted trade-off: audible media playing unattended (music, a 24/7 stream)
keeps the meter running until the screen locks or the audio stops —
counting stays "deliberately generous", now bounded by sound instead of
by nothing.

## Risks / Trade-offs

- [Up to ~15 s of away time still charged per transition] → Accepted; the
  alternative (zero grace) bills input-less reading time as away. Spec caps
  the promise at "about a minute" to keep this testable.
- [`chrome.idle` events fire spuriously on some setups (e.g. screensaver
  toggles)] → Harmless: each toggle only flushes/re-anchors sessions; time
  never double-counts because anchors move forward only.
- [Tick alarm still fires while locked if the worker was already asleep when
  lock happened] → Covered by D3's `queryState` guard at wake; the alarm
  handler acts only after `ready`, and `ready` now knows the idle state.
- [New `idle` permission changes the install prompt] → Accepted; it is a
  low-scrutiny permission and the accuracy win is the point.
