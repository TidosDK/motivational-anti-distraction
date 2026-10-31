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
   and offers no ceremony.
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
12. **Worker eviction** — wait 1–2 idle minutes (worker dies in
    `brave://extensions` output), then browse a blocked site: minutes keep
    accruing (session state restores from storage).

Fill this table after running the steps above:

| # | Step | Result | Notes |
|---|---|---|---|
| 1 | Settings persist | ☐ | |
| 2 | Exhaust → interstitial | ☐ | |
| 3 | Background doesn't count | ☐ | |
| 4 | Ceremony gates | ☐ | |
| 5 | Day-pass scope | ☐ | |
| 6 | Hard block | ☐ | |
| 7 | Day roll | ☐ | |
| 8 | Night owl | ☐ | |
| 9 | Offline blocking | ☐ | |
| 10 | Stats | ☐ | |
| 11 | Brave Shields | ☐ | |
| 12 | Worker eviction | ☐ | |
