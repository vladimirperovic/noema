# Architecture

## Overview

Noema is a single-process Node.js application with no runtime npm package dependencies. It uses the built-in HTTP server, `node:sqlite`, `fetch`, `node:crypto` and static browser assets.

The request path is composed from focused gateways around the core server:

```text
installSecurityGateway(
  installPrivateAssetGateway(
    installGalleryDownloads(
      installFileLibrary(
        installLinkThumbnails(
          createServer()
        )
      )
    )
  )
)
```

Each wrapper owns a narrow responsibility and delegates unmatched requests inward.

## Request layers

### Security gateway

`src/security-gateway.js` is the outer browser/API security boundary. It:

- applies security headers;
- validates trusted-proxy client IP information;
- owns UI login/logout and browser sessions;
- enforces login/API rate limits;
- handles OAuth, backup/share administration and scoped gallery access;
- converts successful authentication into internal request context such as `req.noemaPrivileged` / `req.noemaUiSession`.

Inner application code does not re-run a legacy Basic-auth challenge. Noema intentionally has one browser-auth authority.

### Private asset gateway

`src/private-asset-gateway.js` is the encrypted binary-storage boundary for managed uploads/gallery media/private assets. It:

- resolves normalized paths only below `NOEMA_DATA_DIR`;
- requires authenticated UI/API context or a valid scoped gallery share;
- decrypts bytes only for authorized responses;
- supports authenticated byte-range streaming for chunked assets;
- migrates legacy plaintext assets before returning them;
- seals legacy/core writes before a successful mutating response completes.

### Gallery download gateway

`src/gallery-downloads.js` handles authorized album ZIP downloads. Persistent originals remain encrypted; plaintext copies exist only in isolated system temporary storage while the ZIP is built and are removed afterwards.

### Files gateway

`src/file-library.js` serves `/files`, Files metadata APIs and File binary content. Metadata is stored as encrypted SQLite records. Binary content uses an authenticated AES-256-GCM envelope below `NOEMA_DATA_DIR/files` with atomic replacement/rollback behavior.

### Links thumbnail gateway

`src/link-thumbnails.js` serves existing encrypted Links thumbnails to authenticated UI sessions.

Automatic browser rendering is intentionally disabled in the main process. The old model launched Chromium against user-controlled URLs; URL preflight alone cannot fully constrain a browser's own DNS, redirects and subresources. Generation therefore fails closed until a separately isolated renderer is available.

### Core server

`src/server.js` owns core UI/static routing, tasks, notes, documents, links, AI Projects, galleries, Stats, Calendar reads, MCP, OpenAPI and compatibility routes.

Security-sensitive cross-cutting behavior belongs in the outer gateways rather than duplicating authentication inside the core server.

## Authentication and authorization

### Browser sessions

Successful UI login creates a random opaque token. Only its hash and encrypted session metadata are persisted. Verification enforces idle expiry, absolute expiry, password fingerprint and revocation.

Noema does not use HTTP Basic Auth for browser access and does not emit `WWW-Authenticate` as a UI/API challenge.

### Machine clients

MCP/OpenAPI/tool clients use `NOEMA_API_TOKEN`. The security layer translates successful bearer checks into internal authorization context without passing raw browser credentials through storage gateways.

### Gallery shares

Gallery-share URLs are random bearer secrets. Only token hashes are stored. Shares expire, can be revoked and can be limited to a gallery module and optional album. The private asset gateway applies the same scope when serving encrypted media bytes.

## Storage

### SQLite

`src/store/database.js` provides the primary structured store. Record payloads are encrypted before insertion. Collection adapters in `src/store/collection.js` support migration from legacy encrypted JSON and maintain compatibility/rollback state where required.

SQLite runs in WAL mode to improve concurrency and restart behavior.

### Private binary directories

Managed private binary data is kept below the data root, including:

```text
files/
uploads/
buildingsites/
inspirations/
link-thumbnails/
```

Files use their versioned authenticated binary envelope. Other managed media uses the chunked `NOEMA-ASSET-V1` format from `src/store/private-assets.js`.

### Chunked private assets

Large binary objects are split into independently authenticated chunks. The header records format version, plaintext length, chunk size and a random asset ID. AES-256-GCM associated data binds each chunk to the asset identity, logical size and chunk index.

This supports exact authorized byte ranges without keeping a plaintext persistent copy.

### Encryption and key wrapping

`src/store/crypto.js` owns the random 256-bit installation data-encryption key and AES-256-GCM primitives.

The installation key is random, not the user's password. `NOEMA_DATA_DIR/master.key` stores it wrapped by a key derived from `UI_PASSWORD` with scrypt. Existing deployments may temporarily use a legacy `ENCRYPTION_KEY` during migration.

## Legacy binary migration

Before the server listens, startup verifies the loaded installation key against real encrypted storage and then processes legacy private binary roots.

For each plaintext asset Noema:

1. calculates the source plaintext SHA-256;
2. writes an encrypted candidate;
3. fully authenticates/decrypts the candidate;
4. compares recovered plaintext SHA-256 with the source;
5. renames the source to a rollback copy;
6. installs/re-verifies ciphertext;
7. deletes the rollback only after success.

A failure aborts startup instead of listening with a partially migrated data set.

## Calendar

Google Calendar OAuth is read-only. OAuth state is random, short-lived and bound to the initiating admin session. Refresh tokens are encrypted at rest; short-lived access tokens stay in process memory.

## Backups

Full disaster-recovery backup checkpoints structured storage and includes the complete persistent directory, including `master.key` and encrypted binary assets. The package is then encrypted again with a separate `NOEMA_BACKUP_PASSWORD` because backup archives can leave the host and have a distinct exposure lifecycle.

Portable JSON export is deliberately separate and does not replace full disaster recovery.

## Frontend architecture

Pages remain independent HTML documents. Shared browser modules provide canonical navigation, theme, footer controls, font scaling, WIDTH mode, build/version display and source-task behavior.

The Service Worker is **not** an application-data cache. It uses an explicit allow-list of source-controlled static shell files. `/api`, Files, uploads, gallery/media, thumbnails and backups are network-only. Activation of a new security cache version removes historical Noema caches.

## Shutdown

`src/index.js` handles `SIGTERM` / `SIGINT`, closes collection/database resources and shuts down the HTTP server. Container deployments should preserve a graceful shutdown window.

`docker-entrypoint.sh` repairs persistent-volume ownership when required before dropping from root to the `node` user.

## Testing boundary

`npm run check` syntax-checks runtime/browser/scripts and runs the regression suite. Tests cover authentication boundaries, encrypted persistence, private assets, backups, recurrence/timezone behavior and other core flows.

The Docker image separately runs the suite under isolated build credentials and performs a strict production startup `/healthz` smoke test. Deployment secrets are deliberately cleared from build-test semantics.

Public UI screenshots are generated by a separate Playwright workflow using a clean data directory and neutral seeded demo records; screenshot generation is not part of the production runtime dependency graph.
