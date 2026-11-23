# Design

## Context

See proposal.md — Why. The remaining-time math already exists as a pure
projection (`buildPopupView` in src/shared/stats.ts) and the background
worker already has a serialized refresh path (`refreshRules` in
src/background/index.ts) that runs on every event that can change usage or
settings — accruals, `chrome.storage.onChanged`, the day-roll alarm, pass
expiry, and worker init. Icons are generated parametrically by
`tools/make-icons.mjs` from a single accent-color constant.

## Goals / Non-Goals

**Goals:**
- One source of truth for the badge number, shared with the popup's math.
- Match each active tab to its site while reusing the current refresh queue,
  tab event handlers, permissions, and tick cadence.
- Badge and icon always agree with each other (computed from the same value).

**Non-Goals:**
- No countdown precision better than ~1 minute.
- No badge click behavior or interactivity (the popup remains the
  interactive surface).
- No runtime icon rendering (OffscreenCanvas) — pre-rendered PNGs only.

## Decisions

### D1: Compute a budget for each active tab
`computeBadgeStatus(settings, state, now, site?)` uses shared remaining-time
math. For a tab with a site limit, it uses the smaller of site and combined
remaining time. Other tabs use an empty badge and the normal icon. Match
ordinary URLs with the existing domain rules and the extension's blocking
page with its `s` parameter. Set Chrome action values
by tab ID so each browser window shows the status for its own active tab.

### D2: Compact text, three characters max
Use an empty string for tabs without an individual limit, `0` for exhaustion,
and whole minutes through `99m`. Above that, show whole hours like `3h`,
capped at `9h+` from 10 hours. Show `1m` for positive time under one minute.
The popup shows the exact remaining budget.

### D3: Red icon is a pre-rendered PNG set
`tools/make-icons.mjs` loops an `accent` variant (default orange + red) and
emits `icon-{16,32,48,128}-red.png`; the worker switches via
`chrome.action.setIcon({ path })`. Alternative considered:
`OffscreenCanvas` tinting in the service worker (documented, but adds
runtime image code for one boolean of state).

### D4: Update inside the existing serialized refresh path
`updateActionStatus()` runs in the existing refresh queue. Usage, settings,
reset, and worker startup refresh rules and the badge. Tab activation and
navigation refresh the badge even when usage does not change. A badge-only
refresh reads storage without writing it or diffing blocking rules.

### D5: No hysteresis needed for the red switch
Within a usage day, total usage only increases (accrual is monotonic) and
the day roll resets both usage and status atomically via `loadState`'s lazy
roll — so the over-budget predicate cannot oscillate on tick jitter as an
ordinary threshold sensor would. Settings changes (budget raise, site
removal) are deliberate user actions and may flip the icon immediately.

## Risks / Trade-offs

- [Badge text survives browser restart, showing yesterday's number] → init()
  runs on startup and calls the update; worst case is a few seconds stale.
- [Only the toolbar icon changes color, not the puzzle-menu icon] → Accepted
  Chrome behavior; the toolbar is the glance surface.
