# Proposal

## Why

Everything the extension knows lives in a handful of `chrome.storage.local`
keys — and a browser reinstall or profile glitch erases it silently.
"Lost my settings on reinstall" is a recurring complaint against blocker
extensions, and LeechBlock's config export is repeatedly cited as a reason
people trust it. Local-first implies portable: the user's budgets, history,
and override log must be theirs in a form they can keep and re-open.

## What Changes

- One-click **export** of all extension data (settings, current-day state,
  history, quote-deck position) as a single versioned, human-readable JSON
  file.
- **Import** of that file: fully validated before anything is written; a bad
  or unknown-format file is rejected with a clear message and changes
  nothing; a good file restores everything and enforcement reflects it
  immediately.
- **CSV exports** for analysis in a spreadsheet: one row per usage day
  (per-site minutes + combined + override count) and one row per override
  (site, timestamp, affirmed).
- All of it local: no network access, no new permissions, no new
  dependencies.

## Capabilities

### New Capabilities

- `data-portability`: backup export/import (format, validation, atomicity,
  post-import consistency) and tabular (CSV) exports of history and the
  override log.

### Modified Capabilities

<!-- None: no behavior of blocking, tracking, or the ceremony changes; the
imported data simply flows through the existing storage loaders and the
storage.onChanged rule refresh. -->

## Impact

- `src/shared/backup.ts` (new) — pure build/serialize, parse/validate, and
  CSV builders; unit-tested.
- `src/pages/options/main.ts` + `options.html` — Export, Import, and two CSV
  buttons with status messaging.
- `public/manifest.json` — unchanged (extension-page `<a download>` needs no
  `downloads` permission; `storage` already granted).
- README ("Your data" note) + `docs/testing.md` + an e2e verification script.
