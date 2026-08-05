# Architecture

## Overview

Noema is a single-process Node.js application with no runtime npm package dependencies. It uses the built-in HTTP server, `node:sqlite`, `fetch`, `node:crypto`, static browser assets, and an optional system Chromium executable for Links screenshot generation.

The runtime is composed from focused request gateways:

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

Each wrapper removes the previous request listener, installs its own listener, handles routes in its responsibility, and delegates everything else inward.

## Request layers

### Security gateway

`src/security-gateway.js` is the outer boundary. It applies security headers, trusted-proxy handling and rate limits; verifies opaque UI sessions/API bearer credentials; handles login/OAuth/backup/share administration; validates scoped gallery shares; and passes only authorization results (not raw credentials) to inner storage gateways.

### Private asset gateway

`src/private-asset-gateway.js` is the binary-storage boundary for document uploads, gallery media, and generated Links thumbnails. It:

- resolves only normalized paths below `NOEMA_DATA_DIR`;
- requires an authenticated UI/API context, or a valid gallery share scoped to the requested media;
- decrypts private assets only when they are served;
- supports authenticated byte-range streaming for large assets;
- migrates a legacy plaintext asset before returning it;
- seals legacy/core-server writes before the successful mutating API response completes.

### Gallery download gateway

`src/gallery-downloads.js` handles authenticated/scoped album ZIP downloads. Persistent originals stay encrypted; plaintext copies exist only in an isolated system temporary staging directory while the ZIP is produced, then the staging directory is removed.

### Files gateway

`src/file-library.js` serves `/files`, the Files REST API, and binary content. Files metadata is stored as encrypted records and binary contents are stored in an authenticated AES-256-GCM container below `NOEMA_DATA_DIR/files`.

### Links thumbnail gateway

`src/link-thumbnails.js` performs SSRF-safe URL preflight, launches headless Chromium, writes the transient screenshot to system temporary storage, encrypts it before persistent storage below `NOEMA_DATA_DIR/link-thumbnails`, and serves it only to authenticated requests.

### Core server

`src/server.js` owns the original UI, tasks, notes, documents, links, AI Projects, galleries, Stats, Calendar reads, MCP, OpenAPI, static files, and compatibility routes. New cross-cutting security-sensitive behavior belongs in focused gateways rather than expanding authorization assumptions in the monolith.

## Storage

### SQLite

`src/store/database.js` creates generic metadata tables. Record payloads are encrypted before insertion. Collection adapters in `src/store/collection.js` provide legacy encrypted JSON import and encrypted rollback mirrors.

### Private binary directories

Private binary data lives below:

```text
files/
uploads/
buildingsites/
inspirations/
link-thumbnails/
```

All are encrypted at rest. Files use the versioned `NOEMA-FILE-V1` binary container. Other private media use the chunked `NOEMA-ASSET-V1` format from `src/store/private-assets.js`.

### Chunked private assets

Large binary objects are split into independently authenticated chunks. The asset header records format version, plaintext length, chunk size, and a random asset ID. Each AES-256-GCM chunk binds authenticated data to that asset identity, logical size, chunk size, and chunk index.

This supports exact byte ranges without decrypting or buffering an entire video. Ciphertext is what remains in persistent storage; authorized requests receive reconstructed plaintext bytes.

### Encryption and key wrapping

`src/store/crypto.js` owns the random 256-bit installation data-encryption key and provides AES-256-GCM primitives for metadata and binary content.

The installation key is random, not the password itself. `NOEMA_DATA_DIR/master.key` stores that key wrapped by a key derived from `UI_PASSWORD` with scrypt. Existing deployments may temporarily provide a legacy `ENCRYPTION_KEY`; a successful login validates stored encrypted data and re-wraps the same installation key with the UI master password.

## Legacy binary migration

Before the HTTP server starts, `src/index.js` verifies the loaded installation key against a real encrypted SQLite record and then scans legacy private binary roots.

For each plaintext asset Noema:

1. calculates the plaintext SHA-256;
2. writes a candidate encrypted copy;
3. performs a full authenticated decrypt of that candidate;
4. confirms the decrypted SHA-256 matches the original;
5. renames the original to a rollback file;
6. installs and re-verifies the encrypted replacement;
7. deletes the plaintext rollback only after success.

A failure aborts startup rather than listening with a partially migrated data set. Files have equivalent automatic plaintext-to-encrypted migration within the Files store.

## Authentication and authorization

### Browser sessions

Successful UI login creates a random opaque token. Only its hash and encrypted session metadata are stored. Verification enforces idle expiry, absolute expiry, password fingerprint, and revocation.

The same entered `UI_PASSWORD` protects the wrapped installation data key, giving a one-password user flow while preserving distinct session and encryption mechanisms.

### Machine clients

MCP/OpenAPI and authenticated REST clients use `NOEMA_API_TOKEN`. The outer security layer converts successful bearer/session/share checks into internal authorization context without forwarding raw secrets to storage handlers.

### Gallery shares

Share tokens are random bearer secrets whose hashes are stored. They expire, can be revoked, and can be scoped to a gallery module and optional album. The private asset gateway applies that scope when serving encrypted gallery media.

## Calendar

Google Calendar OAuth is read-only. OAuth state is session-bound and short-lived. Refresh tokens are encrypted at rest; temporary access tokens remain only in process memory.

## Backups

Full disaster-recovery backup checkpoints metadata and includes the complete persistent directory, whose private contents are already encrypted at rest. The resulting package is additionally encrypted with a separate `NOEMA_BACKUP_PASSWORD`. This second layer is intentional because backup archives can leave the server and have a different exposure lifecycle.

## Frontend architecture

Pages remain independent HTML documents. `public/noema-header-footer.js` supplies canonical navigation, theme, footer, font scale, WIDTH mode, build badge, and controller loading. Shared Menu/Theme controls stay tied to the viewport. `public/links-enhancements.js` adds the visual Links Cards/Table controls and missing-thumbnail batch generator.

## Shutdown

`src/index.js` handles `SIGTERM`/`SIGINT`, flushes collections, checkpoints SQLite, and closes the HTTP server. Deployments should preserve the graceful shutdown window.

## Testing boundary

`npm run check` syntax-checks runtime/browser/scripts and runs the full test suite. Encryption tests verify not merely that an uploaded file can be read again, but also that its plaintext marker is absent from persistent storage, legacy migration is byte-identical, and chunked byte ranges reconstruct exactly.

The Docker image runs this suite under isolated test environment variables and separately performs a strict one-password production startup smoke test. Build-time test configuration deliberately ignores inherited deployment secrets.
