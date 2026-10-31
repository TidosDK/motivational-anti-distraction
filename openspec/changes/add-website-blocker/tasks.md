# Tasks

## 1. Project scaffolding

- [x] 1.1 Init npm project with TypeScript, Vite (multi-page: interstitial, options, stats) and a Manifest V3 manifest; verify `npm run build` produces a `dist/` that loads as an unpacked extension in a Chromium browser with the service worker registered (no manifest errors in the extension page)
- [x] 1.2 Add Vitest for unit tests and wire `npm test`; verify a trivial test passes
- [x] 1.3 Curate ~200 motivational quotes into a bundled TS module; verify count >= 150 and build succeeds

## 2. Core domain model

- [x] 2.1 Implement usage-day math (`usageDayStart(now, resetHour)`, `nextReset`) and unit tests covering before/after midnight, exact reset minute, and night-owl attribution; verify tests pass
- [x] 2.2 Implement typed storage layer (`settings`, `state`, `history`, `deck`) with lazy day-roll (stale `dayStart` ⇒ meters/passes reset, closed day appended to history) and a storage `version` field; verify unit tests cover fresh install, day roll, and 30-day history pruning
- [x] 2.3 Implement exhaustion logic (site exhausted ⇔ site meter >= limit OR combined total >= budget, ignoring sites with active passes) with unit tests for the overlap and exempt cases; verify tests pass

## 3. Settings page

- [x] 3.1 Build options page: add/remove blocked sites by domain, per-site limit minutes (optional) and day-pass count, combined budget, reset hour; persist to settings storage; verify by setting values, reloading the extension, and confirming they survive
- [x] 3.2 Normalize and validate domain input (strip URLs/scheme/`www.`, reject invalid); verify with unit tests over sample inputs

## 4. Usage tracking

- [x] 4.1 Implement foreground session accounting in the service worker (`tabs.onActivated`, `tabs.onUpdated`, `windows.onFocusChanged` open/close timestamped sessions for blocked sites only) with unit tests on the pure accounting function; verify tests pass
- [x] 4.2 Add 1-minute `chrome.alarms` flush while a blocked site is focused and flush-on-shutdown; verify observable behavior: foreground minutes accrue in `state.perSiteSeconds`, background tabs do not

## 5. Enforcement

- [x] 5.1 Implement dNR session-rule sync: recompute-and-diff redirect rules (main_frame, domain + subdomains → `interstitial.html?s=<domain>`) on every state change, startup, and settings update; verify by unit-testing the rule-diff function and observing rules via `chrome.declarativeNetRequest.getDynamicRules` in devtools
- [x] 5.2 Implement pass spend + active-pass expiry (site-specific, until `nextReset`) wired into rule sync; verify observable behavior: spending a pass unblocks only that site, and it is blocked again after the day rolls
- [x] 5.3 Add day-boundary alarm to refresh rules and roll the day promptly at the reset hour; verify observable behavior by setting reset hour to one minute ahead and watching exhausted sites reopen

## 6. Interstitial and unlock ceremony

- [x] 6.1 Build interstitial page: blocked site name, remaining passes, quote, fixed confession checkboxes, 30s countdown, disabled-until-both "Quick Override" button; verify observable behavior matching the unlock-ceremony scenarios (each gate independently blocks the button; reload restarts countdown)
- [x] 6.2 Implement quote deck shuffle-cycle with persisted `{cycleOrder, position}` advanced on display; verify unit tests prove no repeats within a cycle and persistence across simulated restarts
- [x] 6.3 Wire override activation: spend pass, record affirmed override event, unblock site, replace interstitial with the real site; verify observable end-to-end unlock flow on a configured test site

## 7. Stats page

- [x] 7.1 Build stats page: today's per-site + combined usage vs limits, passes used, overrides with timestamps, plus >= 7 recent usage days history; verify with seeded storage fixtures rendered correctly

## 8. Integration and hardening

- [ ] 8.1 Run the full manual test checklist in Brave (add sites, exhaust limit, ceremony, day-pass, hard block, next-day reset, offline blocking) and record results in `docs/testing.md`; fix issues found
- [ ] 8.2 Write `README.md`: purpose, build, load-unpacked instructions, and the v1 feature set; verify a fresh clone follows the doc and loads the extension successfully
