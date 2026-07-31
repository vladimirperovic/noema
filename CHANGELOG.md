# Changelog

All notable public changes are documented here.

## [0.3.0] — 2026-07-31

### Added

- Private Files library with Notes-style list/detail interface.
- Files upload, rename, description, open, download, replace, deep-link, task conversion, and deletion.
- Encrypted SQLite Files metadata and randomized atomic binary storage with a 120 MB limit.
- Source-linked tasks for Notes, Documents, Links, Files, AI Projects, Building Sites, and Inspiration.
- Read-only linked-task titles, source badges, and deep-link navigation.
- Stable deterministic recurring-task occurrence IDs and migration of older recurring records.
- One canonical responsive menu, active-page state, shared theme switcher, persistent font controls, and working WIDTH mode.
- Server-side revocable browser sessions with idle and absolute expiry.
- Expiring, revocable, scope-limited, optional album-limited public gallery links.
- Trusted-proxy client IP handling, security headers, HSTS, and expanded request/login rate limits.
- Encrypted Google Calendar refresh-token storage and session-bound OAuth state.
- Portable metadata backup/restore including Files metadata.
- Password-encrypted `.noema` disaster-recovery archives with SHA-256 manifest verification and offline restore.
- CLI backup and restore commands.
- Files, session, share, production-configuration, and existing encrypted-SQLite tests.
- Docker build-time test suite and strict production startup smoke test.
- Footer build commit indicator.

### Changed

- Production now fails closed without UI authentication, API authentication, HTTPS public URL, and exact CORS origin unless the explicit development-only override is enabled.
- Package version updated to 0.3.0.
- Backup UI distinguishes full encrypted archives from portable metadata JSON.
- Service-worker cache updated for Files and source-task controllers.
- Calendar plaintext token files are migrated to encrypted storage and removed.
- All public documentation and `.env.example` updated for the 0.3 architecture and security model.

### Security

- Opaque session and share tokens are stored only as hashes inside encrypted collections.
- Basic authentication headers are stripped before internal request delegation.
- Forwarded client IPs are trusted only from configured proxy addresses.
- Filesystem operations normalize paths and use atomic replacement/rollback.
- Full archives use scrypt-derived AES-256-GCM encryption with a separate backup password.

### Migration notes

- Set the new required production environment variables before upgrading.
- Preserve the complete data directory.
- Configure `NOEMA_BACKUP_PASSWORD` to enable full archive downloads.
- Existing plaintext `google-token.json` is migrated automatically.
- Clear an old service-worker cache or hard-refresh after deployment if the menu does not update.

## [0.2.0] — 2026-07

- Moved primary metadata storage to encrypted SQLite records.
- Added encrypted legacy JSON import and rollback mirrors.
- Added generic public examples and documentation for self-hosting, privacy, customization, and deployment.
- Added optional Stats/SEO configuration and tests.

## [0.1.0]

- Initial public reference release of the task board, notes, documents, links, galleries, Calendar, MCP, and OpenAPI workspace.
