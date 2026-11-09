# site-blocking Specification

## Purpose

Enforces access decisions for the user's list of distraction websites: which
sites are restricted, when navigation to them is blocked, and what the user
sees instead of the site.

## Requirements

### Requirement: Blocked site list
The user SHALL be able to configure a list of blocked sites by domain (e.g.
`youtube.com`), adding and removing entries at any time. A blocked domain MUST
apply to its subdomains and all paths. The list MUST persist across browser
restarts and take effect within 1 minute of being changed, without requiring a
browser restart.

#### Scenario: Add a site
- **WHEN** the user adds `instagram.com` to the blocked list
- **THEN** navigation to `instagram.com` and `www.instagram.com` becomes subject to limits and blocking

#### Scenario: Remove a site
- **WHEN** the user removes `instagram.com` from the blocked list
- **THEN** navigation to `instagram.com` is no longer restricted

### Requirement: Blocking exhausted sites
When the user navigates to a blocked site whose daily limit is exhausted and
for which no day-pass is active, the extension SHALL prevent the site's
content from rendering and SHALL display the interstitial page in that tab
instead.

#### Scenario: Open an exhausted site
- **WHEN** the user opens `youtube.com` after its daily limit is used up and no day-pass is active
- **THEN** the tab shows the interstitial page and no YouTube content is displayed

#### Scenario: Open a site with time remaining
- **WHEN** the user opens `youtube.com` while it has time remaining within its daily limit
- **THEN** YouTube loads normally with no interruption

### Requirement: Day-pass exempted access
While a day-pass is active for a site, the extension SHALL load that site
normally without interruption, regardless of the site's own limit or the
combined budget.

#### Scenario: Site open under day-pass
- **WHEN** the user spends a day-pass on `youtube.com` and later reopens it the same usage day
- **THEN** YouTube loads normally with no interstitial until the next daily reset

### Requirement: Interstitial page
The interstitial page SHALL identify the blocked site, present the unlock
ritual defined by the override-ritual capability, and offer a way to leave the
tab (close tab or go back) without granting access. The interstitial MUST NOT
contain or link to content from the blocked site.

#### Scenario: Interstitial offers escape
- **WHEN** the interstitial is displayed
- **THEN** the user can close the tab or navigate back, and the blocked site remains inaccessible

### Requirement: Offline and local-only enforcement
All blocking decisions SHALL be made locally by the extension. The extension
MUST NOT make network requests to decide whether to block, and MUST continue
blocking correctly while offline.

#### Scenario: Blocking works offline
- **WHEN** the machine has no network access and the user opens an exhausted blocked site
- **THEN** the interstitial is still displayed
