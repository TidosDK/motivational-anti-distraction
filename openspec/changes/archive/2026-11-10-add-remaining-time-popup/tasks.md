# Tasks

## 1. Popup view model (pure, shared)

- [x] 1.1 Add `buildPopupView(settings, state, now)` to `src/shared/stats.ts`: per-site rows (domain, usedSec, limitMin, remainingSec floored at 0, `null` remaining for no-limit sites, fraction) + combined remaining floored at 0 + resetsAt; reused-but-removed domains listed like the stats view; unit tests for normal/exhausted/over-limit/no-limit/removed-domain and combined-zero cases; verify `npm test` passes

## 2. Popup page

- [x] 2.1 Create `popup.html` (root, like stats.html) + `src/pages/popup/main.ts`: load settings+state via `chromeKV` loaders, render per-site remaining rows with meter bars, combined remaining, reset time, options link calling `chrome.runtime.openOptionsPage()`, empty state when no sites; add popup styles to `src/shared/style.css` (`body.popup` ~320px, scrollable list); verify `npm run build` emits `dist/popup.html` and `npm run typecheck` passes
- [x] 2.2 Re-render on `chrome.storage.onChanged` (state/settings) while open; verify live behavior in e2e task 3.1
- [x] 2.3 Wire the toolbar action: add `"default_popup": "popup.html"` to `action` in `public/manifest.json`; verify loaded extension opens the popup on icon click (no manifest errors)
- [x] 2.4 Add a stats-page link next to the options link
- [x] 2.5 Show the installed version in the popup footer and beside the options page title (from `chrome.runtime.getManifest().version`); verify `verify-popup.mjs` asserts the popup version matches the manifest and passes, plus build + typecheck (`<a href="stats.html" target="_blank">`, id `open-stats`, per design D4); verify `verify-popup.mjs` asserts both links and passes, plus build + typecheck

## 3. Verification and docs

- [x] 3.1 Add `tests-e2e/verify-popup.mjs` (real Chromium + built dist/, popup opened as extension page): seed settings + state fixtures → assert per-site remaining, exhausted and no-limit rows, combined remaining, reset label, options link present; then change storage while the popup is open → assert live re-render; verify script passes
- [x] 3.2 Manual check in Brave: click icon → popup shows remaining times for configured sites, link opens options; record in `docs/testing.md`; update README Features/usage to mention the popup

## Workflow follow-up

- After manual verification passes, archive the change (syncs `status-popup` spec into `openspec/specs/`).
