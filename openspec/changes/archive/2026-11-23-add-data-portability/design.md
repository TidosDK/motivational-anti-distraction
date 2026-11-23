# Design

## Context

See proposal.md — Why. All data is four keys in `chrome.storage.local`
(`settings`, `state`, `history`, `deck` — see src/shared/types.ts), each
with an existing tolerant loader (loadSettings/loadState/…). The options
page already writes settings and the background worker refreshes enforcement
on `storage.onChanged`. Rule refresh also schedules expiry for active passes
restored from a backup. `SCHEMA_VERSION` exists but has no migration machinery.

## Goals / Non-Goals

**Goals:**
- One backup file that is self-describing, diffable, and safe to hand-edit
  for power users (or safe to reject cleanly when they don't).
- Import applies atomically and takes effect immediately via the existing
  `storage.onChanged → refreshRules` path.
- CSVs that Excel/LibreOffice open without fuss.

**Non-Goals:**
- No automatic/scheduled backups, no cloud, no encryption (the file is
  plaintext by design — same trust level as the storage it mirrors).
- No migration framework — just an honest format version that refuses
  unknown versions (migration gets built when v2 exists).
- No selective/partial import (whole-backup only for v1).

## Decisions

### D1: Single self-describing JSON envelope
`{ "format": "motivational-anti-distraction-backup", "version": <number>,
"exportedAt": <ISO string>, "data": { "settings": …, "state": …,
"history": …, "deck": … } }` with `version` = `SCHEMA_VERSION` at export
time. Import accepts only the known `format` and `version ===
SCHEMA_VERSION` — **exact match, no backward compatibility**: no existing
backups exist to care for, and compatibility machinery gets written when a
real second format version exists. Anything else is rejected with the
reason. Alternatives: raw key dump (rejected — an unrelated JSON file could
be applied), one file per key (rejected — four-file rituals punish ordinary
users). Forward extension note: when `add-ceremony-personalization` lands
the `userQuotes` storage key, the envelope gains a `userQuotes` section
imported with empty defaults when absent — the single deliberate exception
to exact-match, while there are still no backups in the wild.

### D2: Validate with the same tolerant rules the loaders use, then one atomic write
`parseBackup(text)` in `src/shared/backup.ts` runs pure per-section
validators sharing the normalization logic of the existing loaders
(coercions, defaults, unknown-field stripping) and returns either a fully
typed payload or a list of human-readable errors. On success the options
page writes all four keys in a single `chrome.storage.local.set` — the
operation is atomic per call, so a rejected parse never reaches storage.
Extension pages and the worker share a storage lock so a usage update,
day roll, or deck draw cannot overwrite data read before a restore. Export
reads the four sections under the same lock.
Sanity gate: `state.dayStart` more than 24 h in the future is rejected as
corrupt. Alternative: per-key try/catch with partial application — rejected
(half-imported state is worse than none).

### D3: Downloads without permissions, via extension-page object URLs
Export and CSV use `URL.createObjectURL` + `<a download>`; import uses a
file input read with `FileReader`. From an extension page this needs no
`downloads` permission, keeping the permission set untouched. Filenames
carry the date: `anti-distraction-backup-2026-11-15.json`.

### D4: RFC-4180 CSV
`\r\n` line endings, header row, minimal quoting (fields containing `,`,
`"`, or newlines are quoted; quotes doubled). Timestamps ISO-8601 local
(e.g. `2026-11-15T14:05:00`) and minutes rounded to whole minutes; the
history CSV emits one column per domain that appears in the retained
history (stable order: alphabetical), so rows align with headers.

## Risks / Trade-offs

- [Import from a future version is refused] → Accepted; a clear "backup is
  from a newer version" beats silently dropping unknown fields.
- [History CSV gets wide with many domains] → Accepted; a 50-column CSV is
  still a 50-column CSV in any spreadsheet, and a long-format alternative
  would be worse for pivot users. (Could add later.)
- [User imports a backup containing their vice-list onto a shared machine]
  → Documented in the README's data note; the backup is exactly as private
  as the profile it came from.
- [Deck state imported with a length mismatch] → Existing deck validation
  auto-rebuilds the cycle (deck.ts), so a stale deck degrades to a fresh
  shuffle, never a crash.
