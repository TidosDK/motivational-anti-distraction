# Testing

Two layers: an automated suite (unit + real-browser e2e verifications) and a
manual checklist to run in Brave itself.

## Automated suite

```bash
npm test          # 99 unit tests (day math, storage, exhaustion, accounting,
                  # enforcement rules, quote deck, stats view)
npm run build     # build dist/
node tests-e2e/verify-4.2.mjs   # each verification, in order (they are slow:
node tests-e2e/verify-5.1.mjs   # they observe real alarms/ceremony timers)
node tests-e2e/verify-5.2.mjs
node tests-e2e/verify-5.3.mjs
node tests-e2e/verify-6.1.mjs
node tests-e2e/verify-6.3.mjs
node tests-e2e/verify-7.1.mjs
```

The e2e verifications drive a real Chromium with `dist/` loaded as an
unpacked extension (Playwright `channel: 'chromium'`, headful Xvfb-free via
the local X display). Set `E2E_BROWSER=brave` to attempt them against the
Brave binary; on the development machine Brave refuses to start MV3 service
workers under automation flags, so the suite defaults to Chromium — same
engine family.

### Verification results — 2026-10-31 (dev machine, Chromium 156)

| Verification | Covers | Result |
|---|---|---|
| unit suite (99 tests) | day math, lazy day-roll + pruning, exhaustion, foreground accounting, dNR regex + rule diff, quote deck, stats view | PASS |
| verify-4.2 | 60s foreground accrued in real time; background tab accrued ~0 | PASS |
| verify-5.1 | exhausted site → dNR rule → real navigation redirected (incl. subdomain); budget recovery removes rule | PASS |
| verify-5.2 | pass spend unblocks only that site; day roll expires the pass; re-exhausted site blocks again | PASS |
| verify-5.3 | day-roll alarm scheduled at reset boundary; firing it re-syncs rules and reschedules | PASS |
| verify-6.1 | ceremony: quote, fixed confessions, 30s countdown; each gate independently disables the button; reload restarts lockout; un-check disables | PASS |
| verify-6.3 | end-to-end: ceremony → override → navigates to real site; pass spent, override logged, rule removed; hard-block display when no passes | PASS |
| verify-7.1 | stats page from seeded fixtures: today's meters/limits/passes, badge, override timestamps, history rows, live re-render | PASS |

## Manual checklist (Brave)

Load `dist/` via `brave://extensions` → Development mode → "Load unpacked".
A site list you actually use makes the limits feel real; `example.com` /
`example.org` work for the mechanical checks. Record ✅/❌ per row.

1. **Settings persist** — add `example.com` (limit 10 min, 1 pass), set
   combined budget and reset hour, `chrome://extensions` ⟳ the extension,
   reopen settings: values survive.
2. **Exhaust → interstitial** — set the limit to 1 min, browse
   `example.com` in the foreground until the meter passes it; next visit (or a
   reload, after ≤1 min tick) lands on the interstitial. `www.example.com`
   behaves the same.
3. **Background doesn't count** — leave a blocked tab open in a background
   window for 5+ minutes; stats meter barely moves.
4. **Ceremony** — quote shows, timer runs while you read, Quick Override
   stays disabled until the 30s AND all four confessions. Reload restarts the
   timer from 30.
5. **Day-pass scope** — with two exhausted sites, override one; the other
   stays blocked. The unblocked one loads for the rest of the day.
6. **Hard block** — with passes spent, interstitial says "No day-passes left"
   and offers no ceremony. (By design this persists until the day rolls —
   there is no timed re-check.)
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
| 1 | Settings persist | ✅ | |
| 2 | Exhaust → interstitial | ⚠️ | Works, but block landed 1–3 min after a 1-min limit (see triage). Quote enlarged 2026-10-31. Post-override re-blocking = open product question |
| 3 | Background doesn't count | ✅ | |
| 4 | Ceremony gates | ✅ | |
| 5 | Day-pass scope | ✅ | Override unblocked only the chosen site |
| 6 | Hard block | ✅ | With 0 passes: stays blocked until reset — works great. ("Blocks again after some time" was not the intended behavior; pass-until-reset is per spec) |
| 7 | Day roll | ☐ | Deferred by user |
| 8 | Night owl | ☐ | Deferred by user |
| 9 | Offline blocking | — | Not tested |
| 10 | Stats | ✅ | |
| 11 | Brave Shields | — | Not tested; no observed interference |
| 12 | Worker eviction | ☐ | Instructions rewritten 2026-10-31 — please retest |

### Findings & triage — 2026-10-31 (user run, Brave)

- **Quote too small** → fixed: interstitial quote is now 1.45rem with a
  larger cite line.
- **Blocking lagged a 1-minute limit by 1–3 minutes.** Two compounding
  causes: (1) while you stay on a page without navigating, usage is only
  flushed by the 1-minute meter tick (MV3 alarms have a ~1-minute minimum
  interval), and (2) the redirect rule applies to *new* main-frame
  navigations — a page that is already open (especially a single-page app
  like YouTube) keeps playing until you reload or navigate again. Options
  under discussion: proactively redirect the focused tab the moment a budget
  runs out, and/or tick every 30s.
- **"Site doesn't get blocked again after the override."** Working as
  currently specified: one spent day-pass opens that site until the next
  daily reset, and usage while exempt never re-blocks (it is still counted
  in stats). Whether a pass should instead grant a limited visit (e.g. 10
  minutes, or "until you leave") is an open product decision.
- **Step 6 expectation mismatch:** hard block means "stays blocked until
  the day rolls", not "blocks again shortly". Confirmed working with 0
  passes.
- **Step 12** instructions rewritten to be concrete (idle a blocked
  foreground tab ~5 min, then check stats ≈ full duration). Steps 7–8 to be
  tested later by user.


Feedback based on steps:
1. Works fine
2. I set the limit to 1 minute for example.com, but it seemed like it took way more than 1 minutes. I also added youtube.com with a 1 minute limit, which after 2-3 minutes did block. The example.com domain did block after some time. The "motivational site" where I have to wait 30 seconds did work and was great. I would like for the quoute to be larger so it is more easily seen. It seemed after I went through the "motivational site" for example.com, it wouldn't block the site again (I don't know if I want it to keep blocking the site or not. I want to discuss this at some point).
3. Leaving the website open in the background isn't tracked.
4. Works fine
5. If you mean that both youtube.com and reddit.com is blocked, and I override youtube.com which only unblocks youtube.com and not reddit.com, then yes it works fine.
6. If you mean that it should block the site again after some time, then no, it doesn't block that site again. example.com keeps being unblocked after using the single day-pass. I did try with a site that had no day-passes at all in which it works great.
7. Will test later, not now.
8. Will test later, not now.
9. Won't test.
10. Yes, that works great.
11. Won't test, but doesn't seem to affect.
12. I don't understand the instructions.
