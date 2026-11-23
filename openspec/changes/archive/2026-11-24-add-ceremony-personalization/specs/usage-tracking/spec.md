# Spec Delta

## MODIFIED Requirements

### Requirement: Override event log
The system SHALL record each spent day-pass with the site, timestamp, and
confirmation that the ceremony was completed. The log MUST persist across
browser restarts and remain readable for existing records.

#### Scenario: Override recorded
- **WHEN** the user completes a ceremony and spends a day-pass on YouTube at 14:05
- **THEN** an override entry exists for YouTube at 14:05 marked as affirmed
