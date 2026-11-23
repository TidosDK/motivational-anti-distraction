# Tasks

## 1. Data layer

- [x] 1.1 Raise `pruneHistory` retention to 370 usage days in `src/shared/storage.ts` (single constant) and record an install timestamp: at worker init (post-`ready`, worker-only write), write the `meta` storage key (`installTs`) once when absent — seeded from the oldest recorded history day when history exists, else "now" — with a tolerant reader; unit-test pruning at 369/370/371 days and installTs write-once + seeding (history present → oldest day, empty history → now); verify `npm test` passes
- [x] 1.2 Add a pure `buildHistoryViews(history, settings, state, now, installTs)` to `src/shared/stats.ts` returning heatmap cells (dayKey → combined minutes, bucket index), current/best under-budget streaks (per design D4 semantics), and windowed totals (tracked seconds, override count) with window bounds; unit-test: streak growth/reset/best-retention, zero-day counts as inside, unrecorded mid-history days count as inside, clamping at first recorded day, budget edit re-scores (documented behavior), window label at exactly 370 days, empty-history case; verify `npm test` passes

## 2. Stats page views

- [x] 2.1 Render the heatmap in `src/pages/stats/main.ts` as a CSS grid (weeks × 7, `src/shared/style.css` additions): five intensity buckets relative to the combined budget, native `title` + `aria-label` carrying "date · exact minutes", visible empty cells for zero days, horizontally scrollable; verify `npm run build` + `npm run typecheck` pass and manual check shows a seeded year rendering correctly (reuse the e2e seed helper)
- [x] 2.2 Add the streak row ("current 7 · best 21 · vs current budgets" tooltip) and the lifetime totals row (windowed totals labeled with their window + "using for N days" from `installTs`) above the day table; re-render via the existing `storage.onChanged` handler; verify manual check with seeded fixtures and `npm run typecheck`

## 3. Verification and docs

- [x] 3.1 Add `tests-e2e/verify-reports.mjs` (same harness as `verify-popup.mjs`): seed ~400 days of history (mixed over/under budget, gaps) → assert pruning kept 370, heatmap cell count and buckets, current/best streak values, totals window labels; verify the script passes
- [x] 3.2 Update README Features (heatmap, streaks, lifetime totals, year of history) and add the manual checks (heatmap hover values, streak framing — no penalty behaviors) to `docs/testing.md`; record results

## Workflow follow-up

- Work-in-progress commits carry no version bump; `npm run build` after each task group keeps `dist/` current.
- When the feature is ready for the user to test/validate: `npm run version:minor`, build, and `git push --follow-tags` (CI publishes the tagged GitHub Release).
- User-requested change rounds after validation: `npm run version:patch`, build, push the tag — every bump gets its tag.
- On the user's sign-off, archive the change (syncs `usage-tracking` updates into `openspec/specs/`); archiving itself bumps nothing.
