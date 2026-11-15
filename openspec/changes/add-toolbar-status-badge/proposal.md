# Proposal

## Why

The popup already answers "how much time do I have left?", but only when
you click — the glanceable moment on the toolbar is empty. Both StayFocusd
and LeechBlock show remaining time on the icon; users of blocker extensions
expect it. A badge with the combined budget's remaining minutes (and a red
icon when over budget) puts the budget in front of you at exactly the
glance where temptation starts, at zero interaction cost.

## What Changes

- The toolbar icon gains a **badge** showing the combined budget's remaining
  minutes for the current usage day.
- When the combined budget is fully used, the icon switches to a **red
  variant** and the badge reads zero.
- Badge and icon recompute within about a minute of any usage or settings
  change, after the usage-day reset, and on browser start (badge text
  survives browser restarts, so stale values must be refreshed).
- With no blocked sites configured, no badge is shown.
- No new permissions; the popup, stats, blocking, and ceremony are
  untouched.

## Capabilities

### New Capabilities

- `toolbar-status`: the toolbar icon's ambient status display — what the
  badge shows, when the icon turns red, freshness guarantees, and the
  empty state.

### Modified Capabilities

<!-- None: existing capabilities' requirements are unchanged; the badge only
reads existing state, exactly like the popup. -->

## Impact

- `src/background/index.ts` — one `updateActionStatus()` helper hooked into
  the existing refresh triggers (accruals, `storage.onChanged`, day-roll
  alarm, worker `init`).
- `src/shared/stats.ts` — a pure, unit-tested `computeBadgeStatus()` (same
  remaining-time math the popup view already uses).
- `tools/make-icons.mjs` — parametric color gains a red variant; emits
  `icon-*-red.png` into `public/icons/`.
- `public/manifest.json` — unchanged permissions; `dist/icons/` gains the
  red set via the build.
- README feature list + `docs/testing.md` + one e2e verification script.
