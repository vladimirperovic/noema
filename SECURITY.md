# Security Policy

## Supported versions

Security fixes are provided for the latest release on the default branch. Operators should keep their deployment, Node.js runtime, base image, reverse proxy, and host operating system updated.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose authentication, tokens, stored content, backups, private gallery links, filesystem paths, or remote code execution. Use GitHub private vulnerability reporting when available. Include affected version/commit, reproduction steps, impact, and a proposed mitigation if known.

Do not include real credentials, private data, or active share links in a report.

## Production requirements

Noema fails closed when `NODE_ENV=production` unless the operator explicitly enables the insecure development override. A normal production deployment requires:

- `UI_PASSWORD`
- `NOEMA_API_TOKEN`
- HTTPS `PUBLIC_BASE_URL`
- exact `NOEMA_CORS_ORIGIN`
- persistent `ENCRYPTION_KEY`
- separate `NOEMA_BACKUP_PASSWORD` for full archives

`ALLOW_INSECURE_NO_AUTH=true` is not a production configuration.

## Authentication

### Browser UI

Login creates an opaque random token. Only its SHA-256 hash and encrypted session metadata are stored. Sessions enforce idle expiration, absolute expiration, revocation, and a fingerprint of the current UI password. Logout revokes the session.

The cookie is HttpOnly and SameSite=Lax, and receives the Secure flag when the public URL is HTTPS. Login attempts are limited per client IP and globally.

### API, MCP, and OpenAPI

Machine clients use `NOEMA_API_TOKEN` as a bearer token. Do not place it in URLs, client-side JavaScript, source files, screenshots, or logs. Rotate it after suspected disclosure.

## Reverse proxies

Forwarded client addresses are accepted only when the direct connection comes from an address listed in `NOEMA_TRUSTED_PROXY_IPS`. Do not trust arbitrary `X-Forwarded-For` headers.

Terminate TLS at a maintained reverse proxy, restrict direct backend access, and set upload/body limits deliberately.

## Encryption at rest

Application records are encrypted with AES-256-GCM before SQLite storage. Encrypted compatibility mirrors, sessions, gallery shares, metadata snapshots, and the Calendar refresh token use the same installation encryption system.

This protects storage media and backups from casual inspection but is not end-to-end encryption. The running server can decrypt content for authorized requests. Host compromise or access to both encrypted data and encryption keys defeats storage encryption.

## Files and uploads

The Files module:

- limits content to 120 MB;
- validates base64 input;
- generates UUID-based stored names;
- normalizes every path;
- writes through temporary files and atomic rename;
- rolls back failed metadata/content replacement;
- serves authenticated content with `nosniff` and private no-store caching.

Other upload modules should follow the same invariants. Reverse-proxy limits should not be substantially larger than application limits without a reason.

## Gallery shares

Share tokens are generated from 32 random bytes and stored only as SHA-256 hashes. They expire, can be revoked, and may be limited by module and album. A share URL is a bearer secret: anyone who has it can access the permitted gallery until expiry or revocation.

Public gallery requests cannot use the normal private menu or unrelated API routes.

## OAuth

Google OAuth state is random, short-lived, and bound to the administrator session that initiated it. Refresh tokens are encrypted in `google-token.enc`; access tokens remain in memory. OAuth client credentials belong in environment configuration.

## Outbound requests

Features that fetch user-supplied URLs must use the centralized outbound URL controls and reject unsafe schemes, credentials in URLs, loopback/private destinations where prohibited, and redirect chains that cross into blocked networks.

## Backups

Portable JSON backups are readable and must be protected. Full `.noema` archives include all persistent data and encryption material, then encrypt the package with a separate backup password. The archive format uses a manifest with SHA-256 checksums and AES-256-GCM authentication.

Restore full archives only while Noema is stopped. Store backup passwords separately, retain off-site copies, and test restoration.

## Security headers

The outer gateway applies Content Security Policy, frame denial, MIME sniffing protection, referrer policy, permissions policy, and HSTS for HTTPS production deployments. Review CSP changes whenever adding an external script, font, image, map, or API provider.

## Dependency and runtime security

Noema has no runtime npm dependencies, but it still depends on Node.js, Alpine packages in the container, browser APIs, reverse-proxy software, and optional external services. Monitor and update these components.

## Operator checklist

- Use HTTPS and prevent direct public access to the backend port.
- Use unique, long values for UI, API, encryption, and backup secrets.
- Back up the complete data directory and verify restores.
- Configure only controlled trusted proxies.
- Revoke unused sessions and share links.
- Protect `.env`, volumes, logs, CI variables, and backup destinations.
- Review public gallery content before sharing.
