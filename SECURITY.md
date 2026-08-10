# Security Policy

## Supported versions

Security fixes target the latest release on the default branch. Operators should keep their deployment, Node.js runtime, base image, reverse proxy and host operating system updated.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose authentication secrets, stored content, backups, gallery-share links, filesystem paths or remote-code-execution paths. Use GitHub private vulnerability reporting when available. Never include real credentials, personal content or active share links in a report.

## Production requirements

A normal production deployment requires:

- `UI_PASSWORD` — the single browser master password and wrapping credential for the installation data key;
- `NOEMA_API_TOKEN` — a separate machine-client bearer token;
- HTTPS `PUBLIC_BASE_URL`;
- exact `NOEMA_CORS_ORIGIN`;
- separate `NOEMA_BACKUP_PASSWORD` for full disaster-recovery archives.

`ENCRYPTION_KEY` is retained only as a legacy migration input. New and fully migrated installations do not require it. `ALLOW_INSECURE_NO_AUTH=true` is development-only.

## Authentication

### Browser UI

`src/security-gateway.js` is the sole browser authentication/authorization boundary. Noema does **not** use HTTP Basic Auth, does not accept a Basic username/password challenge as a browser login mechanism and does not emit `WWW-Authenticate` for UI/API authentication.

Successful `/login` creates an opaque random session token. Only its SHA-256 hash and encrypted session metadata are stored. Sessions enforce idle expiration, absolute expiration, revocation and a fingerprint of the current UI password.

Logout revokes the server-side session instead of merely deleting a client cookie.

### API, MCP and OpenAPI

Machine clients use `NOEMA_API_TOKEN` as a bearer token. Keep it different from `UI_PASSWORD`. Do not place the token in URLs, browser JavaScript, source files, screenshots or logs.

Backup/restore administration is not treated as an ordinary machine-token capability; complete private-state export should remain an administrator operation.

## Reverse proxies and HTTPS

Terminate TLS at a maintained reverse proxy, restrict direct backend access and configure only controlled proxy addresses in `NOEMA_TRUSTED_PROXY_IPS`. Forwarded client addresses are ignored when the immediate peer is not trusted.

## Encryption-at-rest policy

Noema applies one persistent-storage rule:

> **Everything the user enters, uploads, or Noema generates from private user data is encrypted at rest.**

This includes record payloads in SQLite, compatibility mirrors, Files binary content, managed uploads, gallery originals/thumbnails, previously generated Links thumbnails, encrypted Calendar refresh-token storage, session metadata and share-token metadata.

Application metadata is encrypted with AES-256-GCM before SQLite storage. Files use an authenticated versioned binary envelope. Other managed private media uses a chunked authenticated asset format so large objects can support exact byte-range access without keeping a plaintext persistent copy.

## Master key model

The installation data key is a random 256-bit key. It is not the user's password. `NOEMA_DATA_DIR/master.key` stores the data key only in wrapped form; a wrapping key is derived from `UI_PASSWORD` with scrypt and AES-256-GCM protects the wrapped key.

The running server necessarily holds the unlocked data key in process memory while serving authorized requests. This is **not end-to-end encryption**. Offline storage exposure is protected; compromise of the running host/process is outside this protection boundary.

Back up `master.key` together with the complete data directory. The password alone cannot reconstruct a lost random installation key.

## Legacy plaintext migration

Private binary migration is fail-closed. Before touching legacy plaintext media, startup verifies the loaded installation key against encrypted SQLite data. For each plaintext asset Noema creates an encrypted candidate, fully authenticates/decrypts it, compares the recovered plaintext SHA-256 with the source, installs the ciphertext with rollback protection and only then removes the plaintext rollback copy.

A migration error aborts startup instead of silently deleting source content or advertising a partially migrated installation as healthy.

## Files and uploads

Files:

- limit content to 120 MB;
- validate the accepted base64 payload format;
- use UUID-based normalized stored names;
- encrypt binary content with AES-256-GCM and record-bound associated data;
- atomically replace content and roll back failed replacement;
- automatically migrate older plaintext File objects.

Document uploads and other managed private assets use the generic encrypted private-asset layer.

## Gallery and media access

Encrypted gallery assets are served only after the outer security gateway establishes an authorized UI/API context or validates a scoped gallery share. Share tokens are random bearer secrets whose hashes are stored; they expire, can be revoked and may be restricted to a module/album.

Large private assets support authenticated byte-range decryption. Persistent ciphertext is never intentionally copied into the public static tree.

Album ZIP creation stages plaintext only in isolated system temporary storage for the duration of archive creation and removes that staging directory on success/failure.

## Links thumbnails

Serving existing encrypted Links thumbnails is supported. **Automatic browser-based thumbnail generation is disabled in the main Noema process/container.**

The old design launched a general-purpose Chromium process against user-controlled URLs. Application-level URL/DNS preflight cannot fully constrain a browser's own DNS resolution, redirects and subresource requests. Thumbnail generation therefore fails closed until an isolated renderer with strict sandbox/network-egress controls is supplied separately.

This removes Chromium and its package-manager/runtime attack surface from the standard Noema container.

## OAuth

Google OAuth state is random, short-lived and bound to the administrator session. Refresh tokens are encrypted at rest; short-lived access tokens remain only in process memory.

## Outbound requests

Features that fetch user-supplied URLs must use centralized URL/DNS controls and reject unsafe schemes, credentials, loopback/private targets where prohibited and redirect chains into blocked networks.

## Service Worker / browser cache

The Service Worker uses an explicit static allow-list. Only source-controlled, data-free shell assets may be placed in Cache Storage.

The following categories are network-only and must never be runtime-cached by the Service Worker:

- `/api/*`;
- Files and uploads;
- Building Site/Inspiration pages and media;
- thumbnails/private assets;
- gallery/share media;
- backup pages/responses.

A cache-version bump deletes historical Noema caches on activation, including caches created by older workers that may have stored authenticated responses.

## Backups

Portable JSON exports are readable and must be protected. Full `.noema` archives include the complete persistent data set, including already-encrypted private media and `master.key`, then add a second AES-256-GCM encryption layer using `NOEMA_BACKUP_PASSWORD`.

The separate backup password is deliberate: archives can leave the server and have a different exposure lifecycle from the online UI credential.

Restore full archives only while Noema is stopped. Keep off-site copies and test restoration.

## Security headers

The outer gateway applies Content Security Policy, frame denial, MIME-sniffing protection, referrer policy, permissions policy and HSTS for HTTPS production deployments.

## Dependency and runtime security

Noema has no runtime npm dependencies. The standard container depends on Node.js and a small Alpine runtime package set (`curl`, `su-exec`, `zip`, `unzip`). Build-time npm/corepack/yarn tooling is removed from the final image after checks complete.

GitHub CI pins third-party Actions by commit SHA. Security/recovery workflows include deterministic source checks, SBOM generation and container scanning where supported.

## Operator checklist

- Use HTTPS and prevent direct public access to the backend port.
- Use a unique long `UI_PASSWORD`, a separate API token and a separate backup password.
- Preserve the complete data directory, including `master.key` and all encrypted binary directories.
- Do not interrupt the first upgraded startup while legacy plaintext migration is running.
- Configure only controlled trusted proxies.
- Revoke unused sessions and gallery shares.
- Protect `.env`, volumes, logs, CI variables and backup destinations.
- Keep Node.js, the container base image, reverse proxy and host patched.
- Treat a browser Service Worker/cache regression as a security issue because authorized plaintext responses must remain network-only.
