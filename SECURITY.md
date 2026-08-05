# Security Policy

## Supported versions

Security fixes are provided for the latest release on the default branch. Operators should keep their deployment, Node.js runtime, base image, reverse proxy, Chromium package, and host operating system updated.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose authentication, tokens, stored content, backups, private gallery links, filesystem paths, or remote code execution. Use GitHub private vulnerability reporting when available. Do not include real credentials, private data, or active share links in a report.

## Production requirements

A normal production deployment requires:

- `UI_PASSWORD` — the single Noema master password used for browser login and protection of the installation data key;
- `NOEMA_API_TOKEN` for machine clients;
- HTTPS `PUBLIC_BASE_URL`;
- exact `NOEMA_CORS_ORIGIN`;
- separate `NOEMA_BACKUP_PASSWORD` for full archives.

`ENCRYPTION_KEY` is retained only as a legacy migration input. New and fully migrated installations do not require it. `ALLOW_INSECURE_NO_AUTH=true` is development-only.

## Authentication

### Browser UI

Login creates an opaque random token. Only its SHA-256 hash and encrypted session metadata are stored. Sessions enforce idle expiration, absolute expiration, revocation, and a fingerprint of the current UI password.

The same `UI_PASSWORD` protects the random installation data-encryption key. Existing installations with a legacy `ENCRYPTION_KEY` migrate by re-wrapping the already-loaded data key; this does not require bulk re-encryption of SQLite records.

### API, MCP, and OpenAPI

Machine clients use `NOEMA_API_TOKEN` as a bearer token. Do not place it in URLs, client-side JavaScript, source files, screenshots, or logs.

## Reverse proxies and HTTPS

Terminate TLS at a maintained reverse proxy, restrict direct backend access, and configure only controlled proxy addresses in `NOEMA_TRUSTED_PROXY_IPS`. Forwarded client addresses are ignored from untrusted immediate peers.

## Encryption-at-rest policy

Noema applies one storage rule:

> **Everything the user enters, uploads, or Noema generates from private user data is encrypted at rest.**

This includes:

- task, note, document, link, gallery, session/share, and other record payloads in SQLite;
- compatibility mirrors and metadata snapshots;
- Files binary content;
- document uploads;
- Building Site and Inspiration originals and thumbnails;
- generated Links screenshot thumbnails;
- Calendar refresh-token storage.

Application metadata is encrypted with AES-256-GCM before SQLite storage. Files use an authenticated versioned binary container. Other private binary media uses a chunked authenticated asset format so large objects can support byte-range access without loading an entire object into RAM.

## Master key model

The 256-bit installation data key is random. It is not the user's password. `NOEMA_DATA_DIR/master.key` stores that random key only in wrapped form; a wrapping key is derived from `UI_PASSWORD` with scrypt and AES-256-GCM protects the wrapped data key.

The running server necessarily holds the unlocked data key in process memory so it can serve authorized requests. This is **not end-to-end encryption**. Offline storage exposure is protected; compromise of the running host/process can defeat server-side encryption.

Back up `master.key` together with the complete data directory. Knowing the password cannot reconstruct a lost random installation key.

## Legacy plaintext migration

Private binary migration is fail-closed. Before touching legacy plaintext media, startup verifies the loaded installation key against encrypted SQLite data. For each plaintext asset Noema creates an encrypted candidate, fully authenticates/decrypts it, confirms its plaintext SHA-256 matches the source, temporarily renames the original as a rollback copy, installs/re-verifies the ciphertext, and only then removes the plaintext backup.

A migration error aborts startup instead of silently deleting source content or serving a partially migrated data set.

## Files and uploads

Files:

- limit content to 120 MB;
- validate base64 input;
- use normalized UUID-based stored names;
- encrypt binary content with AES-256-GCM and record-bound associated data;
- atomically replace content and roll back failures;
- automatically migrate older plaintext File objects.

Document uploads and other managed private assets follow the generic encrypted private-asset layer.

## Gallery and media access

Encrypted gallery assets are served only after the hardened outer security gateway has established an authorized UI session/API bearer context or a valid gallery share. Share tokens remain scoped by module and optional album; the binary gateway applies the same scope to media bytes.

Large private assets support authenticated byte-range decryption. Persistent ciphertext never needs to be copied to a public/static directory.

Album ZIP creation decrypts selected originals only into an isolated system temporary directory. That directory is deleted after the archive stream completes or fails.

## Links thumbnail generation

Links screenshots are generated locally with headless Chromium. Noema does not send saved URLs to a third-party screenshot API.

Before Chromium is launched, the saved URL passes centralized public-URL/SSRF validation. The transient screenshot is written to system temporary storage and encrypted before it is moved into persistent Noema storage. Generated thumbnails require an authenticated UI session.

Keep Chromium current: it is a complex network-facing parser even though its output is stored encrypted.

## Gallery shares

Share tokens are generated from cryptographically random bytes and stored only as SHA-256 hashes. They expire, can be revoked, and may be limited by module and album. A share URL is a bearer secret.

## OAuth

Google OAuth state is random, short-lived, and bound to the administrator session. Refresh tokens are encrypted at rest; access tokens remain only in process memory.

## Outbound requests

Features that fetch user-supplied URLs must use centralized URL/DNS controls and reject unsafe schemes, credentials, loopback/private targets where prohibited, and redirect chains into blocked networks.

## Backups

Portable JSON exports are readable and must be protected. Full `.noema` archives include the complete persistent data set, including already-encrypted private binary assets and `master.key`, then add a second AES-256-GCM encryption layer using a separate backup password.

The separate backup password is deliberate: backup archives may live off-server and should not depend solely on the application's online credential.

Restore full archives only while Noema is stopped, keep off-site copies, and test restoration.

## Security headers

The outer gateway applies Content Security Policy, frame denial, MIME sniffing protection, referrer policy, permissions policy, and HSTS for HTTPS production deployments.

## Dependency and runtime security

Noema has no runtime npm dependencies, but it still depends on Node.js, Alpine/container packages, Chromium for optional thumbnail generation, browser APIs, reverse-proxy software, and optional external services. Keep those components patched.

## Operator checklist

- Use HTTPS and prevent direct public access to the backend port.
- Use a unique, long `UI_PASSWORD`, a separate API token, and a separate backup password.
- Preserve the complete data directory, including `master.key` and all encrypted binary directories.
- Do not interrupt the first upgraded startup while a legacy plaintext media migration is running.
- Configure only controlled trusted proxies.
- Revoke unused sessions and share links.
- Protect `.env`, volumes, logs, CI variables, and backup destinations.
- Keep Node.js, Chromium, the container base image, reverse proxy, and host patched.
