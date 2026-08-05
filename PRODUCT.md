# Product

## Purpose

Noema is a calm, private workspace for people who want one self-hosted place for daily work, reference material, files, project galleries, and AI-accessible tools without adopting a large framework or external database service.

The central mental model remains **yesterday, today, and tomorrow**. Other modules support the work around those tasks rather than competing with the board.

## Product principles

1. **Local ownership** — persistent data stays in the operator-controlled data directory.
2. **Useful by default** — one process, one SQLite database, no dependency installation at runtime.
3. **Progressive depth** — the task board is simple; notes, documents, files, galleries, and integrations are available when needed.
4. **Stable visual language** — warm editorial typography, restrained color, light/dark themes, and one canonical navigation system.
5. **Secure production defaults** — production refuses incomplete authentication, HTTPS, or CORS configuration.
6. **Portable interfaces** — browser UI, REST, OpenAPI, and MCP expose the same workspace.

## Core modules

### Tasks

Tasks belong to yesterday, today, tomorrow, or the archive. They support priority, time, completion, subtasks, ordering, and recurring schedules. Recurring occurrences use deterministic IDs so restarts and repeated generation do not duplicate them.

### Source-linked tasks

A note, document, saved link, file, inspiration collection, building-site collection, or AI project can be added as a task. The task title is then treated as a read-only reference and links back to the source record. One source record maps to at most one active linked task.

### Notes and documents

Notes are lightweight text records. Documents support richer content, formatting, checklists, labels, and uploaded references. Both participate in encrypted SQLite storage and portable metadata backups.

### Links and AI Projects

Links is a visual bookmark manager for saved URLs and fetched metadata. The Cards view supports a persistent 3–6 cards-per-row density control, one-line ellipsized titles, compact descriptions, labels, search, sorting, pinning, archive/bulk actions, and a compact Table view. Existing labels can be clicked while composing a new link instead of being retyped.

If a saved link has no image, the authenticated UI can generate a local page screenshot with headless Chromium. Generated thumbnails remain in the Noema data directory and saved URLs are not sent to a third-party screenshot service.

AI Projects uses the same underlying link collection with a separate workspace and presentation.

### Files

Files is a private library with a list/detail layout matching the Notes family of screens. Users can upload, describe, rename, open, download, replace, deep-link, convert to a task, and delete a file. Metadata is encrypted in SQLite; binary data is stored with randomized names below `NOEMA_DATA_DIR/files`. The current limit is 120 MB per file.

### Building Sites and Inspiration

These modules store image collections and project/reference metadata. Public gallery links are random, hashed at rest, scope-limited, expiring, and revocable. An optional share can be limited to one album.

### Calendar, Stats, MCP, and OpenAPI

Google Calendar is optional and read-only. Its refresh token is encrypted. Stats is optional and configured entirely through environment variables. MCP and OpenAPI allow authenticated machine clients to use supported Noema tools.

## Navigation and accessibility

Every private page receives the same generated menu, theme switcher, footer controls, and active-page state. The menu and top theme buttons are pinned to the viewport rather than page content, so they remain in the same top-right location while long pages scroll. WIDTH switches between the page’s designed maximum width and a 92% viewport layout. Theme, width, font scale, Links card density, and Links Cards/Table view persist locally in the browser.

Public gallery mode deliberately exposes only the gallery navigation and theme control.

## Authentication model

The user enters one `UI_PASSWORD`. It authenticates the browser session and also protects the random installation data-encryption key stored in wrapped form. The password itself is not used directly as the AES data key.

Browser login creates an opaque random session token. Only its SHA-256 hash is stored in the encrypted collection. Sessions have idle and absolute expiration and are revoked on logout or password change. API clients use a separate bearer token.

Existing installations that used a separate `ENCRYPTION_KEY` migrate by re-wrapping the existing random data key after a successful login; stored application records are not bulk re-encrypted.

Production requires a UI password, API token, HTTPS public URL, and exact CORS origin unless the operator explicitly enables the development-only insecure override.

## Backup model

Noema offers two different products:

- **Portable metadata JSON** for inspecting or moving record data. It excludes binary content.
- **Encrypted `.noema` disaster-recovery archive** for restoring the complete installation, including SQLite, encryption material, binary files, generated Links thumbnails, galleries, and compatibility mirrors.

The distinction is intentional and visible in the Backup UI and documentation.

## Non-goals

Noema is not a multi-tenant SaaS, team permission system, public CMS, general-purpose cloud drive, or end-to-end encrypted collaboration platform. Operators are responsible for host security, TLS termination, off-site backup retention, and access to the deployment environment.
