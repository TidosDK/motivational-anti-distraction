# Proposal

## Why

The usage meter currently counts foreground seconds even when the user is
away: a blocked tab left open while idle, or a locked screen, keeps burning
budget and distorting history. The README explicitly acknowledges the blind
spot ("screen lock isn't detected; counting is deliberately generous"). A
meter that lies about your time undermines the whole product premise —
honest numbers — and the fix is a small, well-supported API (`chrome.idle`
reports `active` / `idle` / `locked`, including screen lock).

## What Changes

- The extension gains the `idle` permission and pauses usage counting while
  the user is idle or the screen is locked, resuming on return.
- Away periods are never charged to site budgets or recorded in history.
- On resume, a fresh counting anchor starts at the moment of return; the
  away gap is simply not billed (no retroactive subtraction).
- All existing accounting behavior (multi-window sessions, charge-once per
  domain, day roll, pass sessions) is unchanged — idle is one more reason to
  flush and stop a counted session, alongside minimize and tab close.

## Capabilities

### New Capabilities

<!-- None: this adds a constraint to how usage time is accrued, which the
existing usage-tracking capability already owns. -->

### Modified Capabilities

- `usage-tracking`: adds the requirement that idle and screen-locked periods
  are excluded from counted usage. Existing requirements (daily records,
  override log, stats, retention) are unchanged.

## Impact

- `public/manifest.json` — add `"idle"` to `permissions`.
- `src/background/index.ts` — `chrome.idle.setDetectionInterval` +
  `onStateChanged` wiring; reuse the existing `dropWindow` / `init()`
  re-enumeration machinery for pause/resume; worker-wake state via
  `chrome.idle.queryState`.
- `docs/testing.md` + README — update the counting caveats (remove the
  "screen lock isn't detected" line; note the Linux `locked` caveat).
- `tests-e2e/` — one new verification script for pause/resume accrual.
- No storage schema change; no settings change; no UI change.
