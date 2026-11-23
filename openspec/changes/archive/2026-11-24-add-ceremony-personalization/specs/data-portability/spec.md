# Spec Delta

## MODIFIED Requirements

### Requirement: Full backup export
The system SHALL let the user download a single file containing settings,
the current usage-day state, all retained history, personal quotes, the
own-quotes-only preference, and the quote-deck position. The file SHALL be
human-readable JSON carrying a format identifier, format version, and export
timestamp.

#### Scenario: Backup contains everything
- **WHEN** the user exports a backup from Options after configuring sites, accruing usage, and spending passes
- **THEN** the JSON contains settings, today's counters and active pass state, daily history with the override log, personal quotes and preference, and the deck position

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
