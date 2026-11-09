# Testing

Two layers: an automated suite (unit + real-browser e2e verifications) and a
manual checklist to run in Brave itself.

## Automated suite

```bash
npm test          # 119 unit tests (day math, storage, exhaustion, accounting,
                  # enforcement rules, quote deck, stats view)
npm run build     # build dist/
node tests-e2e/verify-4.2.mjs   # each verification, in order (they are slow:
node tests-e2e/verify-5.1.mjs   # they observe real alarms/ceremony timers)
node tests-e2e/verify-5.2.mjs
node tests-e2e/verify-5.3.mjs
node tests-e2e/verify-6.1.mjs
node tests-e2e/verify-6.3.mjs
node tests-e2e/verify-7.1.mjs
node tests-e2e/verify-9.3.mjs   # ~2 min: waits for a real 1-min pass session
node tests-e2e/verify-10.3.mjs  # ~4.5 min: two windows, real-time accrual
```

The e2e verifications drive a real Chromium with `dist/` loaded as an
unpacked extension (Playwright `channel: 'chromium'`, headful Xvfb-free via
the local X display). Set `E2E_BROWSER=brave` to attempt them against the
Brave binary; on the development machine Brave refuses to start MV3 service
workers under automation flags, so the suite defaults to Chromium — same
engine family.

### Verification results — 2026-11-08 (dev machine, Chromium)

| Verification | Covers | Result |
|---|---|---|
| unit suite (119 tests) | day math, lazy day-roll + pruning, exhaustion incl. timed passes, multi-window accounting incl. same-domain dedupe, storage session map, dNR regex + rule diff, quote deck, stats view | PASS |
| verify-4.2 | 60s foreground accrued in real time; background tab accrued ~0 | PASS |
| verify-5.1 | exhausted site → dNR rule → real navigation redirected (incl. subdomain); budget recovery removes rule | PASS |
| verify-5.2 | pass spend unblocks only that site; day roll expires the pass; re-exhausted site blocks again | PASS |
| verify-5.3 | day-roll alarm scheduled at reset boundary; firing it re-syncs rules and reschedules | PASS |
| verify-6.1 | ceremony: quote, fixed confessions, 30s countdown; each gate independently disables the button; reload restarts lockout; un-check disables | PASS |
| verify-6.3 | end-to-end: ceremony → override → navigates to real site; timed pass spent, override logged, rule removed; hard-block display when no passes | PASS |
| verify-7.1 | stats page from seeded fixtures: today's meters/limits/passes, badge, override timestamps, history rows, live re-render | PASS |
| verify-9.3 | timed day-pass: spend unblocks, in-session nav does not double-spend, session lapse auto-reblocks (pass-expire alarm), next navigation re-blocks and next pass is offered | PASS |
| verify-10.3 | multi-monitor: unfocused second window accrues in real time; same domain in two windows charges once (not doubled); closing a window stops its site while others keep accruing | PASS |
| verify-10.5 | passive watching: with zero interaction for 95s, both windows' usage keeps climbing via alarm ticks only (regression for the worker wake-up race that froze stats; reads via a detached extension window so they can't mask it) | PASS |

## Manual checklist (Brave)

Load `dist/` via `brave://extensions` → Development mode → "Load unpacked".
A site list you actually use makes the limits feel real; `example.com` /
`example.org` work for the mechanical checks. Record ✅/❌ per row.

1. **Settings persist** — add `example.com` (limit 10 min, 1 pass), set
   combined budget, reset hour and day-pass session length, `chrome://extensions`
   ⟳ the extension, reopen settings: values survive.
2. **Exhaust → interstitial** — set the limit to 1 min, browse
   `example.com` in the foreground until the meter passes it; next visit (or a
   reload, after ≤1 min tick) lands on the interstitial. `www.example.com`
   behaves the same.
3. **Background doesn't count** — leave a blocked site as a *non-active* tab
   in a window for 5+ minutes (browse another tab in that window); its stats
   meter barely moves. Same for a *minimized* window showing a blocked site.
 3b. **Multi-monitor counts** — open `example.com` as the active tab of its
   own window, then do all your clicking/typing in a *different* window
   (or on another monitor) for ~3 minutes. The `example.com` meter must
   climb at real time even though its window never has focus. Minimize that
   window: counting stops; restore: it resumes.
4. **Ceremony** — quote shows, timer runs while you read, Quick Override
   stays disabled until the 30s AND all four confessions. Reload restarts the
   timer from 30.
5. **Day-pass scope** — with two exhausted sites, override one; the other
   stays blocked. The unblocked one loads for the pass session (below).
 5b. **Pass session expiry** — set "Day-pass session length" to 1 minute,
   exhaust `example.com` (give it 2 passes), complete the ceremony. The site
   loads. Within the session, visiting again must NOT spend a second pass.
   Wait ~1–2 minutes; the next navigation to `example.com` lands on the
   interstitial again and offers the second pass (not a hard block).
6. **Hard block** — with all of a site's passes spent (e.g. spend both passes
   above), the interstitial says "No day-passes left" and offers no ceremony.
   This persists until the day rolls.
7. **Day roll** — set reset hour to the next hour, exhaust a site, wait for
   the hour + a few seconds: site reopens without touching anything.
8. **Night owl** — with reset hour 5, a session at 01:00 counts toward
   *yesterday's* day (check stats "usage day since" label).
9. **Offline blocking** — with the network off (or devtools offline), typing
   an exhausted domain still shows the interstitial (redirect rules are
   local).
10. **Stats** — per-site bars, combined budget, passes, override timestamps
    and history rows match what you actually did today.
11. **Brave Shields** — Shields up/down on a blocked site doesn't break
    redirect or time accounting.
12. **Worker eviction** — the extension's background worker is killed by the
    browser after ~30s of idle time; it must restore its counting from
    storage on wake-up. Test: open a blocked site (e.g. `example.com` with a
    10-min limit) in a foreground tab and just let it sit for 5 minutes
    without touching the browser. On `brave://extensions` the extension card
    will show "Service worker (inactive)" at some point — that's the eviction
    happening. Then open the stats page: the site should show ≈5 minutes
    (±1 min tick tolerance), *not* just the first 30 seconds. If counting
    stopped at the eviction, that's a failure.

Fill this table after running the steps above:

| # | Step | Result | Notes |
|---|---|---|---|
| 1 | Settings persist | ✅ | 2026-11-03 "seems to work" (incl. day-pass session length field) |
| 2 | Exhaust → interstitial | ⚠️ | Works; block lands 1–3 min after a 1-min limit (accepted: ticks ≤1 min, redirect on next navigation) |
| 3 | Background doesn't count | ✅ | 2026-11-09 minimized window / non-active tab stays flat |
| 3b | Multi-monitor counts | ✅ | 2026-11-09 "when a tab is on another screen it still counts… when minimized, it is not counted. This is what I want" |
| 4 | Ceremony gates | ✅ | |
| 5 | Day-pass scope | ✅ | 2026-11-03 "the daypass seems to work fine" |
| 5b | Pass session expiry | ✅ | Covered by user's 2026-11-03 day-pass confirmation |
| 6 | Hard block | ✅ | 2026-11-09 "seems correct" |
| 7 | Day roll | ✅ | 2026-11-03 "works fine" |
| 8 | Night owl | ✅ | 2026-11-03 "resets at the defined time" |
| 9 | Offline blocking | — | Accepted untested (2026-11-09, by agreement). Redirects are local dNR session rules that fire before any network request, so the interstitial should appear offline by construction |
| 10 | Stats | ✅ | |
| 11 | Brave Shields | — | Accepted untested (2026-11-09, by agreement); no interference observed in weeks of daily driving |
| 12 | Worker eviction | ✅ | 2026-11-09 confirmed in Brave after the wake-race fix (verify-10.5 covers it in Chromium) |

### Findings & triage — 2026-11-08 (user: "still doesn't count properly")

- **Stats freeze while passively watching (e.g. a video)**: real bug found —
  a **worker wake-up race**. The MV3 service worker dies after ~30s idle;
  when the 60s tick alarm woke it, the alarm handler ran *before* `init()`
  had rebuilt the session map, saw zero sessions, cleared the alarm and
  skipped the flush. Nothing counted again until some event (click, tab
  switch, navigation) restarted the machinery — so a purely passive window
  froze. Fixed: every event/alarm handler now awaits a `ready` gate that
  resolves once the session map is rebuilt. Regression test: `verify-10.5`.
- Also fixed: `windows.onBoundsChanged` callback-signature compatibility
  (newer Chrome passes a Window object, older Brave a windowId — the handler
  now accepts both).
- **Please reload the extension (⟳) in `brave://extensions` and re-test
  steps 3, 3b, 6, 12** — especially 3b with a video playing untouched.
  **Resolved 2026-11-09**: user re-tested in Brave — passive/unfocused
  second-screen counting, minimize-stops-clock, hard block and worker
  eviction all confirmed working.

### Findings & triage — 2026-11-03 (user run, Brave)

- **Time under-counted with multiple monitors** ("only counts when I move the
  mouse"): real semantics gap — counting was tied to the *focused* window, so
  an unfocused YouTube window on a second monitor stopped accruing. **Fixed**
  (tasks 10.1–10.3): foreground is now "active tab of any *visible* window";
  every window counts independently, minimized windows don't, and a domain
  open in several windows charges once. Re-test with steps 3/3b.
- **Accepted limitations of the new counting**: a window fully covered by
  another window on the same monitor still counts (browsers expose no
  occlusion signal), and screen lock is not detected. Deliberately generous;
  revisit if it bothers you in practice.
- **Confirmed working by user 2026-11-03**: settings persist, day-pass
  (timed), day roll, night-owl reset.
- **Still open in Brave**: steps 3/3b (new counting), 6 (hard block under the
  timed model), 12 (worker eviction). **All re-tested and confirmed 2026-11-09.**

### Findings & triage — 2026-10-31 (user run, Brave)

- **Quote too small** → fixed: interstitial quote is now 1.45rem with a
  larger cite line.
- **Blocking lagged a 1-minute limit by 1–3 minutes.** Two compounding
  causes: (1) while you stay on a page without navigating, usage is only
  flushed by the 1-minute meter tick (MV3 alarms have a ~1-minute minimum
  interval), and (2) the redirect rule applies to *new* main-frame
  navigations — a page that is already open (especially a single-page app
  like YouTube) keeps playing until you reload or navigate again. Decision:
  keep this behavior (block on next navigation); not treated as a defect.
- **"Site doesn't get blocked again after the override."** → **fixed** by the
  timed day-pass (design D7): a spent pass now opens its site for a
  configurable session (default 10 min) and re-blocks on the next navigation
  once it lapses; the next pass is then offered. Steps 5/5b/6 re-test this.
- **Step 6 expectation mismatch:** hard block (all passes spent) means
  "stays blocked until the day rolls", not "blocks again shortly".
- **Step 12** instructions rewritten to be concrete (idle a blocked
  foreground tab ~5 min, then check stats ≈ full duration). Steps 7–8 to be
  tested later by user.


New feedback:
1. Seems to work
2. I have tested the extension for some days now, and there is some major issues with counting the time. When I have a Youtube video running, it doesn't count all of the time. It only seems to count when I move the mouse or something. I want it to always count the time for when I have a website open, but ignore tabs that are in the background. I have multiple monitors so I might have a youtube video open on one screen and something else on the other. It should count the Youtube video also as I can still watch videos when they are on the other screen.
5. The daypass seems to work fine.
7. The day roll works fine.
8. The night owl works fine. It resets at the defined time.
