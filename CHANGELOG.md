# Changelog

All notable public changes to Noema will be documented here.

The format is based on Keep a Changelog, and releases should follow Semantic Versioning when the public API and data model become stable.

## [Unreleased]

### Added

- Encrypted SQLite storage for tasks, notes, documents, links, inspirations, and building sites.
- Automatic one-time import from existing encrypted JSON stores.
- Shared collection and database layers with transactional collection replacement.
- SQLite migration, encryption, backup, and rollback documentation.
- Regression tests for import, restart persistence, encrypted row payloads, and JSON compatibility mirrors.
- Public open-source documentation and contribution policies.
- Customization and architecture guides.
- Neutral screenshot generation for every browser page.
- Environment-based analytics project configuration.
- Public-release audit workflow and tracked-file inventory.

### Changed

- Raised the direct runtime requirement to Node.js 22.16.0 and moved the Docker image to Node.js 24.
- Replaced duplicated in-memory-map and debounced-JSON persistence code with one reusable collection abstraction.
- Kept encrypted JSON files as continuously updated rollback and archive-backup mirrors.
- Made graceful shutdown idempotent and added an explicit SQLite checkpoint and close step.
- Repositioned Noema as a reference application intended for further modification.
- Documented the rolling yesterday/today/tomorrow task model and archive retention.
- Replaced personal deployment defaults with neutral examples.
- Changed the default timezone to UTC for portable public distribution.

### Fixed

- Fixed weekday and weekend recurring tasks referencing a removed `dow` variable.
- Fixed mobile task-time dialog centering against the dynamic viewport and device safe area.

### Security

- Kept structured record payloads protected with AES-256-GCM before they are stored in SQLite.
- Removed hard-coded personal domains and analytics property IDs from the public code path.
- Added explicit external-service User-Agent configuration.
- Added checks for tracked runtime data, common secret formats, and forbidden personal configuration.

## [0.1.0] - 2026-07-29

### Added

- Initial public reference release preparation.
- Three-day task board, archive, notes, documents, links, AI projects, inspiration library, building-site photo journal, backup, stats, MCP, OpenAPI, optional Google Calendar, authentication, and encrypted local storage.

[Unreleased]: https://github.com/vladimirperovic/noema/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vladimirperovic/noema/releases/tag/v0.1.0
