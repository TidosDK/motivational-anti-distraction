# Proposal

## Why

Today the only way to see how much time you have left on a blocked site is to
open the full stats page (via right-click → the extension's options/stats
flow). Clicking the toolbar icon currently does nothing. A glanceable popup
with each site's remaining budget makes the budget visible exactly at the
moment of temptation, which is the core premise of the extension.

## What Changes

- Clicking the extension's toolbar icon opens a **popup** that lists every
  blocked site with its **remaining time today** (per-site limit minus time
  used), plus the combined budget's remaining time.
- The popup shows the usage-day reset time and a live-updating view (usage
  accrues while it is open).
- The popup contains a link that opens the **options page**.
- Sites without a per-site limit show that they are only governed by the
  combined budget; the popup never blocks or changes anything — it is
  read-only.

## Capabilities

### New Capabilities
- `status-popup`: the toolbar-action popup — what it shows (remaining time
  per blocked site and combined), how it refreshes, empty state, and the
  link to the options page.

### Modified Capabilities

<!-- None: no requirement in usage-tracking, usage-limits, site-blocking or
override-ritual changes; the popup only reads existing state. -->

## Impact

- `public/manifest.json` — `action.default_popup` points at the new page.
- New page: `popup.html` + `src/pages/popup/main.ts`, built by the existing
  Vite multi-page build (new rollup input entry).
- `src/shared/stats.ts` — a pure, unit-tested view function for remaining
  time (reusing `formatDuration` and the lazy-roll storage loaders already
  used by the stats page).
- `src/shared/style.css` — minor popup-specific sizing styles.
- `tests-e2e/` — one new verification script rendering the popup against
  seeded storage; README/docs mention the popup.
