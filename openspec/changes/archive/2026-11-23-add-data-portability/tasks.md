# Tasks

## 1. Pure backup module

- [x] 1.1 Create `src/shared/backup.ts` with `buildBackup(settings, state, history, deck, nowMs)` and `parseBackup(text)`: JSON envelope per design D1, per-section validation sharing the tolerant rules of the existing storage loaders, `state.dayStart` future sanity gate, and human-readable error lists; unit-test round-trip fidelity, malformed JSON, wrong `format`, any `version` not exactly `SCHEMA_VERSION` (older and newer alike), corrupt `dayStart`, and unknown-field stripping; verify `npm test` passes
- [x] 1.2 Add `buildHistoryCsv(history)` and `buildOverridesCsv(history)` to `src/shared/backup.ts` per design D4 (header row, one column per domain alphabetically, RFC-4180 quoting, `\r\n`); unit-test CSV field escaping and header/column alignment with sparse day records; verify `npm test` passes

## 2. Options page UI

- [x] 2.1 Add Export, Import (file input + confirm), History CSV, and Overrides CSV controls to `options.html` + `src/pages/options/main.ts`: exports via `URL.createObjectURL` + `<a download>` (no `downloads` permission), import via `FileReader` → `parseBackup` → single atomic `chrome.storage.local.set` of all four keys, with a status line showing success or the exact validation errors; verify `npm run build` and `npm run typecheck` pass and manual spot-check in Brave (export file parses; importing a bogus file changes nothing)

## 3. Verification and docs

- [x] 3.1 Add `tests-e2e/verify-portability.mjs` (same harness as `verify-popup.mjs`): seed settings+state+history+deck fixtures, then verify the actual downloads and restore into a fresh profile. Assert the popup totals, exhausted-site redirect, restored pass alarm, and deck position. Check that cancelling or rejecting an import leaves storage untouched.
- [x] 3.2 Manual check in Brave: real download of all three files, re-import on a fresh profile restores the same popup numbers; open the CSVs in LibreOffice/Sheets; record results in `docs/testing.md` and add a short "Your data" section to the README (what the backup contains, that it is plaintext and local)

## Workflow follow-up

- Work-in-progress commits carry no version bump; `npm run build` after each task group keeps `dist/` current.
- When the feature is ready for the user to test/validate: `npm run version:minor`, build, and `git push --follow-tags` (CI publishes the tagged GitHub Release).
- User-requested change rounds after validation: `npm run version:patch`, build, push the tag — every bump gets its tag.
- On the user's sign-off, archive the change (adds `data-portability` to `openspec/specs/`); archiving itself bumps nothing.
