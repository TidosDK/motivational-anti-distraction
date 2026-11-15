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
- Zero new triggers, timers, or permissions: reuse the refresh path and the
  existing tick/day-roll cadence.
- Badge and icon always agree with each other (computed from the same value).

**Non-Goals:**
- No per-site badge values, no countdown precision better than ~1 minute.
- No badge click behavior or interactivity (the popup remains the
  interactive surface).
- No runtime icon rendering (OffscreenCanvas) — pre-rendered PNGs only.

## Decisions

### D1: Pure `computeBadgeStatus(settings, state, now)` in shared/stats.ts
Returns `{ badgeText: string, overBudget: boolean }` derived from the
combined budget's remaining seconds (lazy day roll comes free via
`loadState` callers). Alternative: compute in the popup and mirror it —
rejected; the badge must be right even when no UI ever opens.

### D2: Fixed text ladder, 4 characters max
`""` when no sites; `"0"` at or over budget; otherwise minutes as `"47"`
when ≤ 99; `"2h30"` when < 10 h; `"10h+"` beyond. Chrome recommends ≤ 4
characters; the ladder never exceeds it and degrades to capped forms instead
of truncating mid-unit.

### D3: Red icon is a pre-rendered PNG set
`tools/make-icons.mjs` loops an `accent` variant (default orange + red) and
emits `icon-{16,32,48,128}-red.png`; the worker switches via
`chrome.action.setIcon({ path })`. Alternative considered:
`OffscreenCanvas` tinting in the service worker (documented, but adds
runtime image code for one boolean of state).

### D4: Update inside the existing serialized refresh path
`updateActionStatus()` is called at the end of `refreshRulesNow()` (which
init also triggers on worker wake). That already covers every
usage/settings/roll event, so no new alarms or listeners; the badge may lag
a rule refresh by at most one diff call, well under the ~1 minute promise.
`refreshRules`' chain already serializes against concurrent wakes.

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
- [`10h+` for very large budgets is imprecise] → Accepted; nobody plans
  around a 10-hour remaining figure, and the popup has exact numbers.
