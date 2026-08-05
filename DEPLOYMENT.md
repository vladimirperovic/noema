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
UI_PASSWORD=a-strong-master-password
NOEMA_API_TOKEN=a-long-random-machine-token
NOEMA_BACKUP_PASSWORD=a-different-long-backup-password
```

`UI_PASSWORD` is the single Noema master password. It authenticates the browser UI and protects the random installation data-encryption key stored in wrapped form in `NOEMA_DATA_DIR/master.key`.

Existing installations that previously used a separate `ENCRYPTION_KEY` should keep that value for the first startup after upgrading. Sign in once with the normal UI password; Noema validates existing encrypted storage and re-wraps the same data key with that login password. This does not bulk re-encrypt records. After a successful restart with the migrated `master.key`, remove the legacy `ENCRYPTION_KEY` from the environment.

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

Terminate TLS at a reverse proxy and forward to the loopback or private container address.

## Reverse proxies

Noema ignores `X-Forwarded-For` unless the immediate peer address is listed in `NOEMA_TRUSTED_PROXY_IPS`. This prevents clients from selecting their own rate-limit identity.

Discover the actual source address seen by Noema from container networking or proxy logs, then place only controlled reverse-proxy addresses in the comma-separated setting. Do not add client subnets or broad networks.

Preserve the original `Host` and `X-Forwarded-Proto` headers and configure the proxy upload/body limit above the largest file you intend to allow. Noema currently permits 120 MB file content, encoded inside a larger JSON request.

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
2. A strict production process startup and `/healthz` request using complete security settings and only the single `UI_PASSWORD` for browser/encryption master-password duties.

A failed test or startup prevents the image from being built.

## Data directory

Typical contents include:

```text
noema.sqlite
master.key              wrapped installation data-encryption key
*.json                  encrypted compatibility mirrors
files/                  private Files binary data
uploads/                document uploads
buildingsites/          Building Sites media
inspirations/           Inspiration media
google-token.enc        encrypted Calendar refresh token
snapshots/              encrypted metadata snapshots
```

Do not copy only `noema.sqlite` and assume a complete recovery. Encrypted records depend on `master.key`, and binary modules depend on their directories. The master password alone cannot reconstruct a lost random installation data key.

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
3. If upgrading from the old two-secret model, keep the existing `ENCRYPTION_KEY` for the first startup.
4. Run `npm run check` when building outside Docker.
5. Replace the container while preserving the data volume.
6. Sign in once with `UI_PASSWORD`; this migrates legacy `master.key` protection without re-encrypting application records.
7. Restart and confirm `/healthz`, login, Notes, Files, galleries, Calendar, and backup download.
8. After that successful restart, remove the legacy `ENCRYPTION_KEY` if one was previously configured.
9. Keep the previous image and pre-upgrade backup until validation is complete.

## Health monitoring

`GET /healthz` is unauthenticated and intended for container/orchestrator health checks. It does not expose record data. The footer build badge reads `/build-version.json` when the source commit is injected at image build time.
