# data-portability Specification

## Purpose

Gives the user full portability of everything the extension stores: a
versioned JSON backup they can export and re-import, and CSV exports of
usage history and the override log — all without any network access.

## Requirements

### Requirement: Full backup export
The system SHALL let the user download a single file containing all
extension data — settings, the current usage-day state, all retained
history, and the quote-deck position. The file SHALL be human-readable JSON
carrying a format identifier, a format version, and an export timestamp.

#### Scenario: Backup contains everything
- **WHEN** the user uses Export on the options page after configuring sites,
  accruing usage, and spending passes
- **THEN** the downloaded JSON contains the settings, today's counters and
  active pass state, the day-by-day history with the override log, and the
  deck position

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
Exporting and then importing the backup into a fresh install SHALL restore
equivalent behavior: same sites, budgets and passes, same usage-day
counters and history, and the quote deck continues its no-repeat cycle from
the exported position.

#### Scenario: Reinstall restore
- **WHEN** the user reinstalls the extension and imports a backup taken
  mid-deck on the old install
- **THEN** the next ceremony shows a quote that respects the no-repeat
  position contained in the backup

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
