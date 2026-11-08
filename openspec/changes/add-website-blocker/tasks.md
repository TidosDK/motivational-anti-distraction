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
- [x] 8.2 Write `README.md`: purpose, build, load-unpacked instructions, and the v1 feature set; verify a fresh clone follows the doc and loads the extension successfully

## 9. Timed day-pass sessions (revision from manual testing)

Day-passes changed from "open the whole day" to "open a short session (default 10 min)". See design D7 and the revised override-ritual / usage-limits specs.

- [x] 9.1 Storage & types: add `passSessionMin` to settings (default 10); replace `state.passesActive: {domain:boolean}` with `passesUntil: {domain: epochMs}`; add a pass-expiry predicate (`passesUntil[domain] > now`) and thread `now` through exhaustion so an elapsed session no longer exempts a site; unit tests for active/elapsed/absent pass and the reset-cap; verify tests pass
- [x] 9.2 Service worker: `spendPass` sets `passesUntil = min(now + passSessionMin, nextReset)` and is a no-op while a session is already active (no double-spend); schedule a one-shot `pass-expire:<domain>` alarm at expiry (capped at reset) that recomputes rules; existing day-roll and lazy-expiry still reopen/block correctly; unit tests for the spend math and no-double-spend; verify tests pass
- [x] 9.3 UI: options page gains a `passSessionMin` field; interstitial auto-opens only while `passesUntil > now` (expired sessions fall through to ceremony/hard-block again) and the site-status message reports remaining session; stats badge reflects active session; verify observable end-to-end: spend a short pass, navigate within the session (loads), wait for expiry, next navigation re-blocks and the next pass is offered
- [ ] 9.4 Update README and docs/testing.md day-pass wording to the timed-session model; re-run the affected manual checklist steps (5, 6, plus the new re-block-after-session check) in Brave and record results

## 10. Multi-monitor foreground counting (revision from manual testing)

Manual testing showed an unfocused YouTube window on a second monitor stopped accruing because tracking was tied to the *focused* window. Foreground is redefined as "active tab of any **visible** window" (see revised usage-limits spec + design D3). Covered-window occlusion and screen-lock are accepted limitations.

- [x] 10.1 Accounting (pure): replace the single focused-window `ActiveSession` with a per-window session map; sessions keyed by `windowId`; add `openWindowSession` / `closeWindowSession` / `tickAll` transitions and per-domain union so a domain active in several visible windows charges once per second. Unit tests: two different-domain windows accrue independently; same domain in two windows charges once; close flushes; minimized window's session is closed (no accrual). Verify tests pass
- [x] 10.2 Service worker + storage: store the session map; on startup enumerate `windows.getAll` skipping minimized windows and open sessions for each window's active blocked tab; wire `tabs.onActivated`/`onUpdated`/`onRemoved` and `windows.onRemoved` to per-window open/close; `windows.onBoundsChanged` closes a minimized window's session and reopens on restore; `windows.onFocusChanged` no longer ends sessions; keep the 1-min tick alarm running while ANY session is open; day-roll/refresh unchanged. Unit tests for the storage map round-trip. Verify tests pass
- [x] 10.3 Real-browser e2e (`verify-10.3.mjs`): open two browser windows each on a distinct blocked site; focus window B; assert window A's site still accrues in real time while unfocused; then background A's site behind another tab in A and assert it stops. Assert no double-count when the same domain is active in both windows. Record PASS in docs/testing.md
- [ ] 10.4 Update README and docs/testing.md foreground-tracking wording to the visible-window model (multi-monitor, minimized excluded, covered-window/screen-lock limitations); add a manual checklist step for the two-monitor case; re-run manual step 3 and the new step in Brave and record results
- [x] 10.5 Fix worker wake-up race (user report: stats freeze during passive watching): every event/alarm handler awaits the top-level `ready` gate so nothing acts on the session map before `init()` rebuilds it (the tick alarm used to see an empty map on wake, clear itself and skip the flush); `onBoundsChanged` handles both the Window and windowId callback signatures. Regression e2e `verify-10.5.mjs`: two site windows, 95s of zero interaction, usage must keep climbing via alarm ticks only (reads through a detached extension window so they cannot trigger flushes). Verify tests pass

