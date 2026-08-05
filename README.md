# Noema

Noema is a zero-dependency, self-hosted personal workspace built with Node.js, the built-in SQLite module, plain HTML, CSS, and JavaScript. It keeps tasks, notes, documents, links, files, project galleries, calendar events, MCP tools, and OpenAPI routes in one private interface.

## What is included in 0.3

- Yesterday / today / tomorrow task board with priorities, time, subtasks, archive, drag and drop, and stable recurring tasks.
- Notes, documents, links, AI projects, Building Sites, Inspiration, Stats, and a private **Files** library.
- Files metadata stored in encrypted SQLite records and binary content stored below `NOEMA_DATA_DIR/files`; maximum file size is 120 MB.
- Source-linked tasks: records from Notes, Documents, Links, Files, galleries, and AI Projects can become read-only tasks that deep-link back to their source.
- One canonical responsive menu, active-page highlighting, light/dark mode, font scaling, and a persistent WIDTH control.
- Google Calendar read-only integration with an encrypted refresh token and session-bound OAuth state.
- MCP and OpenAPI endpoints for machine clients.
- Server-side revocable browser sessions, trusted-proxy handling, security headers, login/API rate limits, and expiring gallery-share links.
- Encrypted SQLite storage, encrypted compatibility mirrors, encrypted metadata snapshots, and password-encrypted `.noema` disaster-recovery archives.
- One Noema master password for browser login and protection of the installation data-encryption key.
- Docker image syntax tests, storage tests, and a strict production startup smoke test.

## Requirements

- Node.js 22.16 or newer, or Docker.
- Persistent storage for `NOEMA_DATA_DIR`.
- HTTPS for production.
- `zip` and `unzip` for full encrypted backup/restore outside the provided Docker image.

## Quick local start

```bash
cp .env.example .env
# Set UI_PASSWORD. It is the single password used to sign in and protect Noema's data key.
# For an isolated local test you may instead set:
# ALLOW_INSECURE_NO_AUTH=true
npm run check
npm start
```

Open `http://localhost:3000`.

## Production configuration

Production fails closed unless authentication and HTTPS are configured. At minimum set:

```dotenv
NODE_ENV=production
PUBLIC_BASE_URL=https://noema.example.com
NOEMA_CORS_ORIGIN=https://noema.example.com
UI_PASSWORD=replace-with-a-strong-master-password
NOEMA_API_TOKEN=replace-with-a-long-random-token
NOEMA_BACKUP_PASSWORD=replace-with-a-separate-long-backup-password
```

`UI_PASSWORD` is the single Noema master password. A random installation data-encryption key is stored only in wrapped form in `NOEMA_DATA_DIR/master.key`, protected by a key derived from this password.

Existing installations that previously used a separate `ENCRYPTION_KEY` can leave it configured for the first startup after upgrading. On the first successful browser login, Noema validates existing encrypted storage and re-wraps the same data key with the login password. Records are not mass re-encrypted. After a successful restart with the migrated `master.key`, the legacy `ENCRYPTION_KEY` can be removed.

Do not use `ALLOW_INSECURE_NO_AUTH=true` for an Internet-facing deployment. See [DEPLOYMENT.md](DEPLOYMENT.md) and [SECURITY.md](SECURITY.md).

## Docker

```bash
docker build -t noema .
docker run --rm -p 3000:3000 \
  -v noema-data:/app/data \
  --env-file .env \
  noema
```

The image runs the complete test suite during build and then performs a strict production smoke test before it can be published.

## Data and backups

Primary metadata lives in `NOEMA_DATA_DIR/noema.sqlite`; record payloads are encrypted before entering SQLite. Binary assets stay in dedicated directories such as `files/`, `uploads/`, `buildingsites/`, and `inspirations/`.

Create a full encrypted archive:

```bash
npm run backup -- ./noema-backup.noema
```

Restore while Noema is stopped:

```bash
npm run restore -- ./noema-backup.noema /path/to/restored-data
```

A full `.noema` archive includes SQLite, encrypted mirrors, the wrapped installation master key, uploaded files, galleries, and other persistent data. Metadata JSON exports are portable but intentionally do not include binary contents. See [SQLITE_MIGRATION.md](SQLITE_MIGRATION.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Main routes

| Route | Purpose |
|---|---|
| `/` | Task board and calendar |
| `/notes` | Notes |
| `/documents` | Documents and checklists |
| `/links` | Saved links |
| `/files` | Private file library |
| `/ai-projects` | AI project catalog |
| `/buildingsite` | Project/site galleries |
| `/inspiration` | Reference galleries |
| `/stats` | Optional analytics dashboard |
| `/backup` | Metadata snapshots and backup downloads |
| `/openapi.json` | OpenAPI description |
| `/mcp` | MCP Streamable HTTP endpoint |
| `/healthz` | Health check |

## Documentation

- [PRODUCT.md](PRODUCT.md) — product scope and behavior
- [ARCHITECTURE.md](ARCHITECTURE.md) — runtime and storage architecture
- [CUSTOMIZATION.md](CUSTOMIZATION.md) — menu, UI, labels, and module customization
- [DEPLOYMENT.md](DEPLOYMENT.md) — Docker, reverse proxies, environment, and backups
- [SQLITE_MIGRATION.md](SQLITE_MIGRATION.md) — storage format and migration
- [PRIVACY.md](PRIVACY.md) — data flows and external services
- [SECURITY.md](SECURITY.md) — security model and vulnerability reporting
- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow
- [SUPPORT.md](SUPPORT.md) — troubleshooting
- [CHANGELOG.md](CHANGELOG.md) — release history

## License

MIT. See [LICENSE](LICENSE).

## Roadmap: Noema Web/PWA + client-side E2EE

Planned next security layer: keep Noema usable as the same Web/PWA on iPhone and desktop while moving sensitive Notes and Files to client-side end-to-end encryption. The browser encrypts before upload and decrypts after download; the server should store ciphertext only and should never receive the plaintext master encryption key.

See [E2EE_ROADMAP.md](E2EE_ROADMAP.md) for the proposed key model, multi-device enrollment, file streaming, migration strategy, search implications, and threat-model limitations of browser-delivered JavaScript.
