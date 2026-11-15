# Tasks

## 1. Worker: blanked-word draw + effective deck

- [ ] 1.1 Add the `userQuotes` storage key (`{ quotes: string[], ownOnly: boolean }`) with tolerant loader/saver in `src/shared/storage.ts` + types (trim, drop empties, cap ~500 chars/quote); unit-test loader tolerance and caps; verify `npm test` passes
- [ ] 1.2 Build the effective deck in the worker (own-only mode with empty-deck fallback to bundled; else bundled ∪ user quotes) and extend the `nextQuote` response to `{ text, expectedWord, author }` with deterministic blank-word selection (longest word, preferring ≥ 4 chars, punctuation stripped); unit-test word selection (short quotes, punctuation, ties) and deck composition per mode (deck.ts itself unchanged); verify `npm test` passes
- [ ] 1.3 Extend `siteStatus` with `passesLast7Days` for the domain (today's `passesUsed` + override entries in the 6 preceding usage-day keys via existing day math); unit-test the 7-usage-day window across a day roll; verify `npm test` passes

## 2. Ceremony page

- [ ] 2.1 Replace the confession checkboxes in `src/pages/interstitial/` with the fill-in-the-blank input: render `text` with the blank as a focused inline input, disable paste, compare trimmed/case-insensitive against `expectedWord`; Quick Override gated on countdown-elapsed AND correct word (countdown/reload semantics untouched); remove the bundled confession list; unit-test the pure validation/word-check helpers; verify `npm test` + `npm run typecheck` pass
- [ ] 2.2 Render the recent-passes line when `siteStatus.passesLast7Days > 0` (factual wording, `textContent`, hidden at zero); verify `npm run build` passes and the interstitial renders both states with seeded storage

## 3. Options editor

- [ ] 3.1 Add a quotes editor to `options.html` + `src/pages/options/main.ts`: add/remove user quotes, toggle own-quotes-only, list current quotes (`textContent`), writing via the new storage key; verify `npm run build` + `npm run typecheck` pass and manual spot-check: an added quote appears in a test ceremony; own-only mode with zero quotes falls back to bundled

## 4. Verification and docs

- [ ] 4.1 Add `tests-e2e/verify-ceremony-personalization.mjs` (same harness as `verify-popup.mjs`): seed user quotes + history with 3 passes for the site in the last 7 days → assert the interstitial shows a deck draw (user quote appears across repeated draws with no repeats within a cycle), the blank matches a word of the served quote, the button stays locked until countdown elapsed AND correct word, and the recent-passes line shows 3 then hides at zero; verify the script passes
- [ ] 4.2 Update README Features (fill-in-the-blank ceremony replacing the checklist, custom quotes + own-only mode, recent-passes line) and record the manual ceremony walkthrough (word gate, reload → full countdown + next quote, own-only fallback) in `docs/testing.md`

## 5. Backup envelope extension (depends on add-data-portability)

- [ ] 5.1 Extend `src/shared/backup.ts` envelope with a `userQuotes` section: export always; import with `{ quotes: [], ownOnly: false }` when absent; unit-test round-trip and missing-section default; verify `npm test` passes

## Workflow follow-up

- Work-in-progress commits carry no version bump; `npm run build` after each task group keeps `dist/` current.
- When the feature is ready for the user to test/validate: `npm run version:minor`, build, and `git push --follow-tags` (CI publishes the tagged GitHub Release).
- User-requested change rounds after validation: `npm run version:patch`, build, push the tag — every bump gets its tag.
- On the user's sign-off, archive the change (syncs the amended `override-ritual` requirements into `openspec/specs/`); archiving itself bumps nothing.
