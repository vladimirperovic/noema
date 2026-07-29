# Changelog

All notable public changes to Noema will be documented here.

The format is based on Keep a Changelog, and releases should follow Semantic Versioning when the public API and data model become stable.

## [Unreleased]

### Added

- Public open-source documentation and contribution policies.
- Customization and architecture guides.
- Neutral screenshot generation for every browser page.
- Environment-based analytics project configuration.
- Public-release audit workflow and tracked-file inventory.

### Changed

- Repositioned Noema as a reference application intended for further modification.
- Documented the rolling yesterday/today/tomorrow task model and archive retention.
- Replaced personal deployment defaults with neutral examples.
- Changed the default timezone to UTC for portable public distribution.

### Security

- Removed hard-coded personal domains and analytics property IDs from the public code path.
- Added explicit external-service User-Agent configuration.
- Added checks for tracked runtime data, common secret formats, and forbidden personal configuration.

## [0.1.0] - 2026-07-29

### Added

- Initial public reference release preparation.
- Three-day task board, archive, notes, documents, links, AI projects, inspiration library, building-site photo journal, backup, stats, MCP, OpenAPI, optional Google Calendar, authentication, and encrypted local storage.

[Unreleased]: https://github.com/vladimirperovic/noema/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vladimirperovic/noema/releases/tag/v0.1.0