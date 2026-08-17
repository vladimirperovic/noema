# Changelog

All notable public changes are documented here.

## Unreleased

### Added

- Public README screenshot gallery generated automatically from neutral demo data in a clean checkout.
- Security/recovery CI coverage for secret scanning, deterministic SPDX SBOM generation and container vulnerability scanning.
- Regression coverage for legacy-auth removal, Service Worker cache isolation, recurring-task idempotency and DST transition days.
- Deterministic recurring-task occurrence IDs with an explicit template/first-occurrence model.

### Changed

- `src/security-gateway.js` is now the single browser authentication/authorization authority.
- Legacy inner browser authentication was removed from `src/server.js`, including HTTP Basic challenge handling, old HMAC-style UI sessions, duplicate `/login`/`/logout` handling and the duplicate login limiter.
- The Service Worker now caches only an explicit list of source-controlled static shell assets. API, Files, uploads, galleries, private media, thumbnails and backups are network-only.
- Service Worker cache versioning now removes historical Noema caches during activation.
- Browser-based Links thumbnail generation is disabled in the standard Noema process/container until it can run in a separately isolated renderer with strict network controls.
- Chromium is no longer included in the standard Docker runtime image.
- Docker build/test credentials are isolated from deployment secrets and npm/corepack/yarn are removed from the final runtime image.
- Persistent-volume ownership recovery no longer relies on a stale one-time marker; restored trees are rechecked before dropping privileges.
- Calendar day-bound calculations now resolve each local midnight independently, correctly representing 23-hour and 25-hour DST transition days.
- Public documentation was refreshed to match the current authentication, cache, encryption, Docker and thumbnail-renderer boundaries.
- Files storage supports bounded-memory raw uploads, authenticated chunk encryption and HTTP Range downloads while retaining legacy base64 compatibility.
- New `NOEMA-ASSET-V1` writes use compact AES-GCM chunks while readers remain compatible with the earlier chunk envelope.
- SQLite collection storage now supports nested-safe immediate transactions, batched upsert/delete operations and an in-memory collection cache.

### Security

- Noema no longer emits `WWW-Authenticate` for UI/API access and no longer relies on an inner HTTP Basic compatibility layer.
- The outer security gateway owns opaque server-side sessions and logout revocation.
- Old Service Worker caches that may have been created by broader runtime-caching logic are deleted on activation of the static-only worker.
- Private/API responses are explicitly excluded from browser Cache Storage by path and response cache policy.
- Automatic Chromium rendering of user-controlled URLs fails closed in the main container rather than relying on incomplete application-level browser isolation.
- CI Actions used by the public repository are pinned to commit SHA values.

### Migration notes

- After upgrading from an older Service Worker, reload once so the new worker can activate and remove old Noema caches. If a browser remains on an old shell, unregister the old worker/cache or perform a hard refresh.
- Existing deployments should keep their current `ENCRYPTION_KEY` only as long as required for the legacy migration path, then remove it after successful restart/login/data validation.
- Existing encrypted Links thumbnails remain readable; only new automatic browser rendering is disabled in the standard container.
- Keep a verified full backup and previous image until login, Files, galleries and backup restore have been validated after upgrade.
- Existing private-asset containers written with the earlier chunk envelope remain readable after the compact chunk upgrade.

## [0.3.0] — 2026-07-31

### Added

- Private Files library with Notes-style list/detail interface.
- Files upload, rename, description, open, download, replace, deep-link, task conversion and deletion.
- Encrypted SQLite Files metadata and randomized atomic binary storage with a 120 MB limit.
- Source-linked tasks for Notes, Documents, Links, Files, AI Projects, Building Sites and Inspiration.
- Read-only linked-task titles, source badges and deep-link navigation.
- Stable recurring-task support.
- One canonical responsive menu, active-page state, shared theme switcher, persistent font controls and WIDTH mode.
- Server-side revocable browser sessions with idle and absolute expiry.
- Expiring, revocable, scope-limited and optional album-limited public gallery links.
- Trusted-proxy client IP handling, security headers, HSTS and request/login rate limits.
- Encrypted Google Calendar refresh-token storage and session-bound OAuth state.
- Portable metadata backup/restore including Files metadata.
- Password-encrypted `.noema` disaster-recovery archives with manifest verification and offline restore.
- CLI backup and restore commands.
- Docker build-time test suite and strict production startup smoke test.
- Footer build commit indicator.

### Changed

- Production fails closed without UI authentication, API authentication, HTTPS public URL and exact CORS origin unless the explicit development-only override is enabled.
- Package version updated to 0.3.0.
- Backup UI distinguishes full encrypted archives from portable metadata JSON.
- Calendar plaintext token files migrate to encrypted storage.
- Public documentation and `.env.example` were updated for the 0.3 architecture and security model.

### Security

- Opaque session and share tokens are stored only as hashes inside encrypted collections.
- Forwarded client IPs are trusted only from configured proxy addresses.
- Filesystem operations normalize paths and use atomic replacement/rollback.
- Full archives use scrypt-derived AES-256-GCM encryption with a separate backup password.

### Migration notes

- Set required production environment variables before upgrading.
- Preserve the complete data directory, including `master.key`.
- Configure `NOEMA_BACKUP_PASSWORD` to enable full archive downloads.
- Existing plaintext Calendar token state is migrated automatically where applicable.

## [0.2.0] — 2026-07

- Moved primary metadata storage to encrypted SQLite records.
- Added encrypted legacy JSON import and rollback mirrors.
- Added generic public examples and documentation for self-hosting, privacy, customization and deployment.
- Added optional Stats/SEO configuration and tests.

## [0.1.0]

- Initial public reference release of the task board, Notes, Documents, Links, galleries, Calendar, MCP and OpenAPI workspace.
