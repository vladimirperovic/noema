# Deployment

## Supported runtime

Noema requires Node.js 22.16 or newer because it uses the built-in `node:sqlite` module. The provided Docker image uses Node 24 Alpine and includes `curl`, `zip`, and `unzip`.

Persistent state must be mounted at `NOEMA_DATA_DIR` (`/app/data` in the Docker image).

## Required production settings

Noema 0.3 fails closed in production. Unless the explicit development escape hatch is enabled, startup requires:

```dotenv
NODE_ENV=production
PUBLIC_BASE_URL=https://noema.example.com
NOEMA_CORS_ORIGIN=https://noema.example.com
UI_PASSWORD=a-strong-browser-password
NOEMA_API_TOKEN=a-long-random-machine-token
ENCRYPTION_KEY=a-long-random-storage-secret
NOEMA_BACKUP_PASSWORD=a-different-long-backup-password
```

`PUBLIC_BASE_URL` must use HTTPS and CORS must be an exact origin. `ALLOW_INSECURE_NO_AUTH=true` is only for isolated development and should never be used on an Internet-facing host.

## Docker Compose example

```yaml
services:
  noema:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - noema-data:/app/data

volumes:
  noema-data:
```

Terminate TLS at a reverse proxy and forward to the loopback or private Docker address.

## Reverse proxies

Noema ignores `X-Forwarded-For` unless the immediate peer IP is listed in `NOEMA_TRUSTED_PROXY_IPS`. This prevents clients from selecting their own rate-limit identity.

Example:

```dotenv
NOEMA_TRUSTED_PROXY_IPS=172.18.0.1,127.0.0.1
```

Only add addresses that are controlled reverse proxies. Preserve the original `Host` and `X-Forwarded-Proto` headers and configure the proxy upload/body limit above the largest file you intend to allow. Noema currently permits 120 MB file content, encoded inside a larger JSON request.

## Session and share lifetime

```dotenv
SESSION_IDLE_HOURS=24
SESSION_ABSOLUTE_HOURS=168
GALLERY_SHARE_TTL_DAYS=30
```

Browser sessions are revocable and expire on both idle and absolute timers. Gallery links are random, hashed at rest, expiring, revocable, and may be scoped to one module or album.

## Docker build verification

The Dockerfile performs two independent checks:

1. `npm run check` under `NODE_ENV=test`, including syntax and storage tests.
2. A strict production process startup and `/healthz` request using complete security settings.

A failed test or startup prevents the image from being built.

## Data directory

Typical contents include:

```text
noema.sqlite
noema-master.key
*.json                 encrypted compatibility mirrors
files/                 private Files binary data
uploads/               document uploads
buildingsites/         Building Sites media
inspirations/          Inspiration media
google-token.enc       encrypted Calendar refresh token
snapshots/             encrypted metadata snapshots
```

Do not copy only `noema.sqlite` and assume a complete recovery. Encrypted records depend on the installation key and binary modules depend on their directories.

## Backups

### Full disaster recovery

Create a password-encrypted archive:

```bash
npm run backup -- /secure/path/noema-backup.noema
```

The command checkpoints SQLite, flushes encrypted mirrors, includes the entire persistent data directory, creates SHA-256 checksums, and encrypts the resulting package with AES-256-GCM using a key derived from `NOEMA_BACKUP_PASSWORD`.

Restore while Noema is stopped:

```bash
npm run restore -- /secure/path/noema-backup.noema /path/to/noema-data
```

The restore verifies the manifest and keeps the previous target directory beside the restored data for rollback. Test restores periodically and keep at least one off-site copy.

### Portable metadata

The Backup page can export a readable JSON snapshot of record metadata. It includes Files metadata but not file binaries, gallery images, document uploads, the SQLite database, or the installation key. Use it for inspection or record migration, not complete disaster recovery.

## Upgrades

1. Create and verify a full encrypted backup.
2. Pull the new source or image.
3. Run `npm run check` when building outside Docker.
4. Replace the container while preserving the data volume.
5. Confirm `/healthz`, login, Files, galleries, Calendar, and backup download.
6. Keep the previous image and pre-upgrade backup until validation is complete.

## Health monitoring

`GET /healthz` is unauthenticated and intended for container/orchestrator health checks. It does not expose record data. The footer build badge reads `/build-version.json` when the source commit is injected at image build time.
