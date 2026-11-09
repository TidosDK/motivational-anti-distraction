# Motivational Anti-Distraction

A Chrome/Brave extension that closes your time-sink sites once you've had
enough — and makes you *honestly admit why* before letting you back in.

The premise: soft blockers fail because the override is frictionless. Here,
every extra visit past your budget costs you a short motivational ceremony —
a quote plus a mandatory 30-second pause during which you check four honest
confessions ("This is for work", "I am NOT slacking off right now!", …).
The friction is the feature.

## Features (v1)

- **Block list with budgets** — add sites by domain (subdomains included).
  Optional per-site daily limit (e.g. 60 min YouTube, 30 min Instagram) plus
  a combined budget across all blocked sites (e.g. 2 h total).
- **Foreground-only tracking (multi-monitor aware)** — minutes count while
  the site is the active tab of **any visible window**, so a YouTube window
  on your second monitor keeps counting while you work on the first.
  Background tabs and minimized windows are free. (A window fully covered by
  another still counts — browsers can't detect that — and screen lock isn't
  detected either; counting is deliberately generous.)
- **Configurable day reset** — the usage day flips at an hour you pick
  (default 05:00), so 1 a.m. browsing counts toward the night it started in.
  All counters, passes and stats roll together at that boundary.
- **The ceremony** — past your budget, the site redirects to an
  interstitial: one motivational quote from a 274-quote deck (shuffle-cycled,
  no repeats until the deck is exhausted), a fixed list of confessions you
  must all affirm, and a 30-second lockout running *while you read the
  quote*. Reload restarts the lockout.
- **Day-passes** — each site gets a configurable number of passes per usage
  day (default 1). One pass opens *that* site for a short session (default
  10 minutes, configurable in settings) instead of the whole day; when the
  session ends, the site blocks again if its budget is still spent, and the
  next entry costs another pass. Other exhausted sites stay blocked the whole
  time. A pass is never double-spent: while a session is open, the site is
  simply accessible. Sessions are cut short by the day reset. Spent passes are
  logged with timestamps. No passes left ⇒ hard block until the day rolls.
- **Usage stats** — today's per-site meters vs limits, combined budget bar,
  passes used, override log, and 31 days of history.
- **Toolbar popup** — click the icon for a glance at the time remaining today
  per site and on the combined budget (live-updating while open), with a
  shortcut to the options page.

All data stays in `chrome.storage.local` on your machine. No network access,
no analytics, zero runtime dependencies.

## Build

Requires Node 20+ and npm.

```bash
npm ci
npm run build      # → dist/ (manifest, pages, service worker)
npm test           # unit tests
```

## Load it

1. Build as above.
2. Open `brave://extensions` (or `chrome://extensions`).
3. Enable **Development mode** (top-right toggle).
4. Click **Load unpacked** and select the `dist/` directory.
5. Click the extension icon — the popup shows the time remaining today per
   site — then **Open Options** to add your first blocked site.
   Remember: nothing is blocked until you add domains and exhaust their
   budgets.

To iterate: edit code → `npm run build` → hit ⟳ on the extension card →
reload blocked tabs.

## Versioning

`package.json` holds the one and only version. The build stamps it into
`dist/manifest.json` automatically — `public/manifest.json` deliberately has
no version field, so the two can never drift. The extension card in
`brave://extensions` shows that stamped version.

The rhythm:

- **Every change bumps the patch.** After committing implementation work
  (any change you want visible in Brave), run
  `npm run version:patch   # 0.1.0 → 0.1.1` then `npm run build`.
- **A finished OpenSpec change bumps the minor.** When a change is complete
  and being archived, run `npm run version:minor   # 0.1.x → 0.2.0`.
- `npm run version:major   # 0.x → 1.0.0` stays a deliberate, manual decision.

Each `version:*` script bumps `package.json`, creates a release commit and a
git tag in one step. `npm version` needs a clean tree: commit work first,
then bump. The build fails loudly if the version isn't a valid Chrome
manifest version (1–4 dot-separated integers — no `-beta` suffixes).

## Testing

Unit tests: `npm test`. Real-browser verifications and the manual Brave
checklist: see [`docs/testing.md`](docs/testing.md).

## How it works (short version)

A Manifest V3 service worker tracks every visible window's active tab and
accrues foreground seconds per blocked domain in `chrome.storage.local` (one
session per window, so unfocused windows on other monitors still count; a
domain shown in several windows charges once). When a site's meter
crosses its limit or the combined total crosses the budget, a
`declarativeNetRequest` session rule redirects its main-frame navigations to
the interstitial page. The interstitial runs the ceremony (confessions +
concurrent 30 s lockout) and, on Quick Override, spends a day-pass: the rule
for that domain comes down for the pass session (default 10 minutes, capped
at the day boundary). Expiry is lazy — a pass exempts its site only while its
stored expiry timestamp is in the future — with a one-shot alarm at the expiry
instant just to re-sync the rules promptly when the browser is idle. Usage
days roll lazily on read (correctness never depends on an alarm surviving) with a
backup alarm right at the reset hour for promptness.

## Roadmap

- Quote videos as an alternative ceremony input
- Per-site schedules (e.g. no socials before noon)
- Streaks / reflection export
