# Design

## Context

See proposal.md — Why. The stats page already implements the exact pipeline
the popup needs: read `chrome.storage.local` via the shared `chromeKV`
loaders (`loadSettings`, `loadState` — which rolls the usage day lazily on
read), project it through a pure view function (`buildStatsView`), render DOM
rows, and re-render on `chrome.storage.onChanged`. The toolbar `action`
currently has no `default_popup` and no `onClicked` handler anywhere, so
adding a popup changes no existing behavior.

## Goals / Non-Goals

**Goals:**
- Reuse the existing shared layer (storage loaders, duration formatting,
  meter styles) instead of duplicating projection logic.
- Keep all popup logic that carries behavior in a pure, unit-tested function.
- Work without any service-worker round-trip (popups must render even while
  the worker is asleep; see the task 10.5 wake-up race lesson).

**Non-Goals:**
- No pass management, unblocking, or any mutation from the popup.
- No per-site history or override log in the popup (stats page covers that).
- No badge on the toolbar icon.

## Decisions

### D1: Popup reads storage directly, not via worker messages
The popup uses `chromeKV` + `loadSettings`/`loadState` directly, like the
stats page. Alternative: an RPC to the service worker (as the interstitial
does for `siteStatus`). Rejected: it would couple popup rendering to worker
wake-up timing and add a message type for no benefit — `loadState`'s lazy day
roll already guarantees fresh-day numbers when opened after a rollover, and
`chrome.storage.onChanged` gives live updates because the worker writes state
on every accrual tick and session end.

### D2: Pure `buildPopupView(settings, state, now)` in `src/shared/stats.ts`
Returns per-site rows `{ domain, usedSec, limitMin, remainingSec | null,
fraction }` (remaining = limit·60 − used, floored at 0; `null` remaining for
no-per-site-limit sites) plus `combinedRemainingSec` and `resetsAt`. DOM code
in `src/pages/popup/main.ts` stays trivial rendering; the view function gets
vitest coverage (exhausted, over-limit, no-limit, removed-but-used domains,
combined floored at 0). Alternative: reuse `buildStatsView` and subtract in
the page — rejected: remaining-time semantics deserve their own tested unit.

### D3: Wire-up is manifest + build entry only
`public/manifest.json` gains `"default_popup": "popup.html"` under `action`;
`vite.config.pages.ts` gains a `popup: popup.html` rollup input; `popup.html`
lives at the repo root like the other pages and loads
`/src/pages/popup/main.ts`. No background changes needed — nothing registers
`chrome.action.onClicked` today.

### D4: Options link uses `chrome.runtime.openOptionsPage()`
An anchor/button whose handler calls `chrome.runtime.openOptionsPage()`
(honors the manifest `options_ui`, closes the popup automatically).
Alternative: `<a href="options.html" target="_blank">` — works but bypasses
the declared options surface.

### D5: Popup chrome via shared style.css
`body.popup { width: 320px }` plus a compact list style reusing `.meter`,
`.usage-row`, `.badge`, `.muted` from `src/shared/style.css`. Keeps the
zero-framework, one-stylesheet convention.

## Risks / Trade-offs

- [Popup numbers are as fresh as the last storage write; a tab accruing
  usage is reflected only when the worker flushes (≤ 1 min)] → acceptable:
  the stats page has the same granularity; the live-update requirement is
  met via `storage.onChanged`.
- [`loadState` writes back storage on read, so "read-only" popup performs the
  same lazy-roll write the stats page does] → it is the documented roll
  bookkeeping, never a budget/pass/usage mutation; spec's read-only clause
  targets state changes a user could notice.
- [Very long block lists make the popup scroll] → cap list height with
  `overflow-y: auto` (Chrome clamps popups to 600px anyway).
