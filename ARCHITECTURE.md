# Architecture

## Overview

Noema is a single-process Node.js application with no runtime npm package dependencies. It uses the built-in HTTP server, `node:sqlite`, `fetch`, `node:crypto`, static browser assets, and an optional system Chromium executable for Links screenshot generation.

The runtime is composed rather than implemented as one replacement server:

```text
installSecurityGateway(
  installGalleryDownloads(
    installFileLibrary(
      installLinkThumbnails(
        createServer()
      )
    )
  )
)
```

Each wrapper removes the previous request listener, installs its own listener, handles routes in its responsibility, and delegates everything else inward.

## Request layers

### Security gateway

`src/security-gateway.js` is the outer boundary. It:

- applies security headers and HSTS when appropriate;
- resolves client IPs only through configured trusted proxies;
- rate-limits API and login activity;
- verifies opaque server-side UI sessions;
- handles login, logout, Calendar OAuth, backup routes, and gallery-share administration;
- validates scoped gallery-share access;
- strips Basic authentication before delegation;
- bridges an approved request into the legacy monolithic server without exposing the opaque session token.

Related modules live under `src/security/` and security collections under `src/store/`.

### Gallery download gateway

`src/gallery-downloads.js` handles authenticated/scoped album ZIP downloads and original-image downloads without expanding the authorization assumptions in the core server.

### Files gateway

`src/file-library.js` serves `/files`, the Files REST API, and binary content. It accepts a verified UI session or API bearer token. Files metadata is handled by `src/store/files.js`; binary content is kept outside SQLite under `NOEMA_DATA_DIR/files`.

### Links thumbnail gateway

`src/link-thumbnails.js` handles authenticated generation and delivery of local page screenshots for Links records. It looks up the stored link, performs the same public-URL/SSRF preflight used by outbound fetches, launches headless Chromium only after validation, stores PNGs below `NOEMA_DATA_DIR/link-thumbnails`, updates the link image path, and serves generated thumbnails only to authenticated UI requests.

### Core server

`src/server.js` owns the original UI, tasks, notes, documents, links, AI Projects, galleries, Stats, Calendar event reads, MCP, OpenAPI, static files, and compatibility routes. New cross-cutting security-sensitive routes should be implemented in a focused gateway rather than adding more authorization assumptions to the monolith.

## Storage

### SQLite

`src/store/database.js` creates a generic `noema_records` table and a `noema_meta` table. Record payloads are encrypted before insertion. Collection adapters in `src/store/collection.js` provide load/list/get/set/remove/replace operations, legacy encrypted JSON import, and encrypted rollback mirrors.

### Binary directories

Binary data remains on the filesystem:

```text
files/
uploads/
buildingsites/
inspirations/
link-thumbnails/
```

The Files module writes randomized names atomically and stores the original display name in encrypted metadata. Gallery modules keep their own media directory conventions. Links screenshots are generated PNGs referenced by encrypted link metadata.

### Encryption and key wrapping

`src/store/crypto.js` loads the random installation data-encryption key and provides authenticated encryption. It protects SQLite record payloads, collection mirrors, snapshots, sessions, shares, and Calendar refresh-token storage.

The installation data key is not derived directly from the user's password. It is random and stored in `NOEMA_DATA_DIR/master.key` wrapped by a key derived from `UI_PASSWORD` with scrypt. Existing deployments can temporarily provide the legacy `ENCRYPTION_KEY`; the first successful login validates the old data key and re-wraps that same key with the normal UI password instead of re-encrypting every stored record.

## Authentication and authorization

### Browser sessions

Successful UI login creates a random opaque token. `src/store/sessions.js` stores only its hash, plus encrypted session metadata. Verification enforces idle expiry, absolute expiry, password fingerprint, and revocation.

The same entered `UI_PASSWORD` unlocks both login and the wrapped installation data key, giving the user a single-password flow while keeping authentication/session state and data encryption as separate mechanisms.

### Machine clients

MCP, OpenAPI tools, and authenticated REST access use `NOEMA_API_TOKEN` as a bearer token. Browser and machine credentials are deliberately separate.

### Gallery shares

`src/store/share-tokens.js` stores only token hashes. `src/security/share-routes.js` applies expiration, revocation, module scope, and optional album scope. Public gallery mode receives a restricted navigation interface.

## Source-linked tasks

`src/store/todos.js` stores optional source metadata. Browser controllers add Task actions to source records, reconcile old local mappings, and decorate task rows with source badges and deep links. The backend prevents normal title edits on source-linked tasks and deduplicates one task per source.

## Recurrence

Recurring task templates keep a stable template ID. Generated occurrences use deterministic IDs derived from template ID plus calendar date. This makes generation idempotent across process restarts and repeated hourly checks.

## Calendar

`src/store/calendar.js` performs a read-only OAuth flow. OAuth state is bound to the initiating administrator session and expires after ten minutes. Refresh tokens are encrypted at rest; access tokens exist only in memory and are refreshed on demand.

## Backups

`src/security/backup-state.js` exports and restores portable metadata collections. `src/store/backup.js` creates full disaster-recovery archives by checkpointing SQLite, flushing mirrors, copying the persistent directory, generating a SHA-256 manifest, zipping the payload, and encrypting it with AES-256-GCM.

Full archive restore is an offline operation because replacing the live SQLite database and encryption material while the process is running would be unsafe. Generated Links thumbnails are included because they live inside the persistent data directory.

## Frontend architecture

Pages remain independent HTML documents with inline page-specific behavior. `public/noema-header-footer.js` supplies the canonical menu, theme, footer, font scale, WIDTH mode, build badge, and module-controller loading. Shared top menu/theme controls are moved to the viewport layer so they do not scroll with page content.

`public/source-task-buttons.js` and `public/source-task-navigation.js` add cross-page linked-task behavior and shared browser enhancements. `public/links-enhancements.js` adds the Links Cards/Table switch, 3–6 cards-per-row control, compact text treatment, and missing-thumbnail batch generator without changing the underlying Links data model. `public/noema-i18n.js` provides interface localization.

## Shutdown

`src/index.js` handles `SIGTERM` and `SIGINT`, closes every collection, checkpoints/closes SQLite, then closes the HTTP server. Deployments should allow the ten-second graceful-shutdown window.

## Testing boundary

`npm run check` performs syntax checks across runtime/browser/scripts and runs all Node tests. The Dockerfile runs that suite in test mode and then starts the full application under strict production configuration and probes `/healthz`. The Docker runtime also includes Chromium so the same image can service optional Links thumbnail requests after deployment.
