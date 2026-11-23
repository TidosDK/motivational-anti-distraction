# Tasks

## 1. Pure status view and red icons

- [x] 1.1 Add `computeBadgeStatus(settings, state, now)` to `src/shared/stats.ts` returning `{ badgeText, overBudget }` per the D2 text ladder (empty for no sites, `"0"` at/over budget, minutes ≤ 99, `HhMM` < 10h, `"10h+"` beyond); unit-test boundaries 0, exactly-budget, 1, 99, 100, 599, 600 min, no-sites, and a rolled-over day (stale `state.dayStart` → fresh day's number); verify `npm test` passes
- [x] 1.2 Extend `tools/make-icons.mjs` with an accent-color variant (orange default + red) emitting `icon-{16,32,48,128}-red.png` into `public/icons/`; run the tool, eyeball the PNGs, and verify `npm run build` copies them into `dist/icons/`

## 2. Background wiring

- [x] 2.1 Wire `updateActionStatus(settings, state, now)` into the end of `refreshRulesNow()` in `src/background/index.ts`: reuse the settings and state loaded for rule enforcement, call `computeBadgeStatus`, apply `chrome.action.setBadgeText`/`setBadgeBackgroundColor` (red background when a number is shown, transparent when empty) and `chrome.action.setIcon` with the normal or red icon paths; unit-test with a mocked `chrome.action` (badge text ladder values, red↔normal icon switch, empty badge for no sites); verify `npm test` and `npm run typecheck` pass

## 3. Verification and docs

- [x] 3.1 Add `tests-e2e/verify-badge.mjs` (real Chromium + built `dist/`, same harness as `verify-popup.mjs`): seed settings+state so 47 min remain → assert `chrome.action.getBadgeText` reports `47` and the normal icon is set; seed over-budget state → assert badge `0` and red icon paths; verify the script passes
- [x] 3.2 Manual check in Brave: over-budget icon is visibly red, day reset returns it to normal, no badge with an empty block list; record results in `docs/testing.md` and add a badge line to the README Features section

## Workflow follow-up

- Work-in-progress commits carry no version bump; `npm run build` after each task group keeps `dist/` current.
- When the feature is ready for the user to test/validate: `npm run version:minor`, build, and `git push --follow-tags` (CI publishes the tagged GitHub Release).
- User-requested change rounds after validation: `npm run version:patch`, build, push the tag — every bump gets its tag.
- On the user's sign-off, archive the change (adds `toolbar-status` to `openspec/specs/`); archiving itself bumps nothing.
