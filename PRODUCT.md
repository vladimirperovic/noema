# Product

## Purpose

Noema is a calm, private workspace for people who want one self-hosted place for daily work, reference material, files, project galleries and AI-accessible tools without adopting a large framework or external database service.

The central mental model remains **yesterday, today and tomorrow**. Other modules support the work around those tasks rather than competing with the board.

## Product principles

1. **Local ownership** — persistent data stays in the operator-controlled data directory.
2. **Useful by default** — one process, one SQLite database, no runtime npm dependency installation.
3. **Progressive depth** — the task board is simple; Notes, Documents, Files, galleries and integrations are available when needed.
4. **Stable visual language** — warm editorial typography, restrained colour, light/dark themes and one canonical navigation system.
5. **Secure production defaults** — production refuses incomplete authentication, HTTPS or CORS configuration.
6. **Portable interfaces** — browser UI, REST, OpenAPI and MCP expose the same workspace.
7. **No silent browser persistence of private content** — the Service Worker caches only an explicit static shell allow-list.

## Core modules

### Tasks

Tasks belong to yesterday, today, tomorrow or the archive. They support priority, time, completion, subtasks, ordering and recurring schedules.

Recurring tasks use a template/first-occurrence model with deterministic occurrence IDs. Generation is idempotent and respects the configured start date, preventing duplicate occurrences after restart or repeated generation.

Calendar-day calculations use the configured IANA timezone and handle DST transition days correctly.

### Source-linked tasks

A Note, Document, saved Link, File, Inspiration collection, Building Site collection or AI Project can be added as a task. The task title becomes a read-only reference and deep-links back to the source record.

### Notes and Documents

Notes are lightweight text records. Documents support richer content, formatting, checklists, labels and uploaded references. Both participate in encrypted SQLite storage and portable metadata backups.

### Links and AI Projects

Links is a visual bookmark manager for saved URLs and fetched metadata. It supports Cards/Table views, persistent card density, labels, search, sorting, pinning, archive/bulk actions and one-line titles.

Existing encrypted Links thumbnails can be displayed. Automatic browser-based thumbnail generation is intentionally disabled in the main Noema container until it can run inside a separately isolated renderer with strict network egress controls.

AI Projects uses the same underlying link collection with a separate workspace and presentation.

### Files

Files is a private library for upload, description, rename, open, download, replace, deep-link, task conversion and deletion. Metadata is encrypted in SQLite; binary content is stored in an authenticated AES-256-GCM envelope below `NOEMA_DATA_DIR/files`.

The current public implementation accepts up to 120 MB per file.

### Building Sites and Inspiration

These modules store image collections and project/reference metadata. Persistent originals/thumbnails are encrypted. Public gallery shares are random, hash-stored, expiring, revocable and scope-limited; a share can optionally be limited to one album.

### Calendar, Stats, MCP and OpenAPI

Google Calendar is optional and read-only. Its refresh token is encrypted. Stats is optional and configured through environment variables. MCP and OpenAPI allow authenticated machine clients to use supported Noema tools.

## Navigation and accessibility

Every private page receives the same navigation, theme switcher, footer controls and active-page state. WIDTH switches between the designed page width and a broader viewport layout. Theme, width, font scale and some module-specific view preferences persist locally in the browser.

Public gallery mode deliberately exposes a reduced navigation surface.

## Authentication model

The user enters one `UI_PASSWORD`. It authenticates the browser session and protects the random installation data-encryption key stored in wrapped form. The password itself is not used directly as the AES data key.

`src/security-gateway.js` is the single browser auth authority. Noema does not use a legacy HTTP Basic Auth username/password challenge.

Browser login creates an opaque random session token. Only its SHA-256 hash and encrypted session metadata are stored. Sessions have idle and absolute expiration and are revoked on logout. Machine clients use a separate bearer token.

Existing installations that used `ENCRYPTION_KEY` can migrate without bulk re-encrypting existing SQLite records.

## Browser cache model

The Service Worker is only an offline shell helper. It caches a small explicit list of source-controlled HTML/JS/icon assets.

Private/API/File/upload/gallery/media/thumbnail/backup routes are network-only. A cache version upgrade removes historical Noema caches so older workers cannot retain authenticated plaintext responses.

## Backup model

Noema exposes two intentionally different backup products:

- **Portable metadata JSON** for inspecting or moving record data; binary contents are excluded.
- **Encrypted `.noema` disaster-recovery archive** for restoring the complete installation, including SQLite, `master.key`, private binary data and compatibility state.

Full archives use a separate `NOEMA_BACKUP_PASSWORD` because off-server backups have a different security lifecycle from the online UI.

## Public project documentation

The public repository includes reproducible neutral screenshots generated from a clean test checkout. The screenshot workflow refuses to use a non-empty `data/` directory, seeds generic demo records and commits only generated PNGs under `docs/screenshots/`.

## Non-goals

Noema is not a multi-tenant SaaS, team-permission system, public CMS, general-purpose cloud drive or end-to-end encrypted collaboration platform. Operators remain responsible for host security, TLS termination, off-site backup retention and deployment-environment access.
