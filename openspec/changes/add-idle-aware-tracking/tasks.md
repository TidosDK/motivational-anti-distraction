# Tasks

## 1. Worker idle wiring

- [ ] 1.1 Add `"idle"` to `permissions` in `public/manifest.json`; verify `npm run build` succeeds and the unpacked `dist/` loads in Brave with no manifest errors
- [ ] 1.2 Extract the window re-enumeration in `src/background/index.ts` `init()` into a reusable function (`retrackAllVisibleWindows`) so both startup and idle-resume use one code path; verify existing unit tests and `npm run typecheck` still pass (pure refactor, no behavior change)
- [ ] 1.3 Call `chrome.idle.setDetectionInterval(15)` at worker init; gate the initial re-enumeration behind `chrome.idle.queryState` — when the state is `idle`/`locked`, flush restored session segments up to `now`, clear sessions, and skip tracking; verify by adding a unit test around the extracted decision helper (state → track / flush-and-clear) and running `npm test`
- [ ] 1.4 Wire `chrome.idle.onStateChanged`: on `idle`/`locked` flush and drop every window session (existing `dropWindow` pattern for all windows), clear the session map, and clear the tick alarm via `manageTickAlarm`; on `active` re-run `retrackAllVisibleWindows`; verify with a unit test on the extracted pause/resume helper (no double-accrual across pause→resume) and `npm test` green

## 2. Verification and docs

- [ ] 2.1 Extend `docs/testing.md` with the manual Brave checks: leave a blocked tab open and trigger system idle → budget stops within ~1 min; lock the screen → no accrual; unlock → counting resumes fresh; record results (system idle cannot be simulated by the Playwright-based `tests-e2e/` scripts, so this group is the verification of record)
- [ ] 2.2 Update the README counting caveats: remove "screen lock isn't detected" and document idle/lock exclusion plus the Linux best-effort `locked` caveat; verify README matches observed behavior from task 2.1
- [ ] 2.3 Add `tests-e2e/verify-idle.mjs` asserting the no-billing invariant the worker can prove without real idle events: with seeded sessions and a `queryState` result of `locked` at wake, no accrual is written for the gap and the tick alarm is not armed; verify the script passes against the built `dist/`

## Workflow follow-up

- Work-in-progress commits carry no version bump; `npm run build` after each task group keeps `dist/` current.
- When the feature is ready for the user to test/validate: `npm run version:minor`, build, and `git push --follow-tags` (CI publishes the tagged GitHub Release).
- User-requested change rounds after validation: `npm run version:patch`, build, push the tag — every bump gets its tag.
- On the user's sign-off, archive the change (syncs the `usage-tracking` spec update into `openspec/specs/`); archiving itself bumps nothing.
