# data-portability Specification

## Purpose

Gives the user full portability of everything the extension stores: a
versioned JSON backup they can export and re-import, and CSV exports of
usage history and the override log — all without any network access.

## Requirements

### Requirement: Full backup export
The system SHALL let the user download a single file containing settings,
the current usage-day state, all retained history, personal quotes, the
own-quotes-only preference, and the quote-deck position. The file SHALL be
human-readable JSON carrying a format identifier, format version, and export
timestamp.

#### Scenario: Backup contains everything
- **WHEN** the user exports a backup from Options after configuring sites, accruing usage, and spending passes
- **THEN** the JSON contains settings, today's counters and active pass state, daily history with the override log, personal quotes and preference, and the deck position

### Requirement: Import validates fully before applying anything
The system SHALL accept an imported backup only after validating the format
identifier, the format version, and the structure of every section. A file
that fails validation SHALL be rejected with a clear, human-readable reason,
and no stored data may be changed by a rejected import.

#### Scenario: Corrupted file rejected
- **WHEN** the user imports a JSON file that is malformed, not a backup of
  this extension, or of an unknown future format version
- **THEN** the options page reports the reason and the existing settings,
  usage, and history are untouched

#### Scenario: Valid file applied at once
- **WHEN** the user imports a valid backup
- **THEN** settings, usage, history, and deck state are all replaced by the
  imported data without a browser restart, and blocking rules immediately
  reflect the imported settings (an exhausted imported site redirects right
  away)

### Requirement: Round-trip fidelity
Exporting a backup and importing it into a fresh install SHALL restore the
same sites, budgets, passes, current usage and history. The system SHALL
restore the personal quotes and deck preference and resume the quote cycle
from its exported position. A backup without a personal quote section SHALL
restore an empty personal deck with own-quotes-only disabled.

#### Scenario: Reinstall restore
- **WHEN** the user reinstalls the extension and imports a backup taken midway through a personal quote cycle
- **THEN** the personal quotes and deck preference are restored and the next quote respects the saved position

#### Scenario: Restore a backup from before personal quotes
- **WHEN** the user imports a valid backup without a personal quote section
- **THEN** the restored personal quote list is empty and own-quotes-only is disabled

### Requirement: CSV exports of history and overrides
The system SHALL let the user download two CSV files: one row per recorded
usage day (day, per-site minutes, combined minutes, override count) and one
row per override event (site, timestamp, affirmed). Files SHALL have a
stable header row and parse cleanly in a standard spreadsheet application.

#### Scenario: History opens in a spreadsheet
- **WHEN** the user downloads the history CSV after a week of use
- **THEN** the file has a header row plus one row per recorded usage day
  with readable timestamps and minute values

### Requirement: Portability is local-only
Export and import SHALL work entirely on the local machine and SHALL NOT use
any network access.

#### Scenario: Offline backup
- **WHEN** the browser is offline and the user exports or imports
- **THEN** both operations complete normally
