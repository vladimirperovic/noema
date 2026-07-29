# Deployment

Noema is a single-process Node.js application with no runtime **Node.js package** dependencies. It can run directly with Node.js or from the included Dockerfile.

Noema is a reference application. Review the code, authentication model, storage model, integrations, and backup policy before exposing a customized fork to the internet.

## Requirements

- Node.js 20 or newer, or Docker
- a persistent writable directory for `data/`
- the system `zip` command when running directly with Node.js and using full ZIP archive downloads; JSON export does not require it
- HTTPS through a reverse proxy for internet-facing deployments
- strong values for `UI_PASSWORD`, `NOEMA_API_TOKEN`, and `ENCRYPTION_KEY`

The included Dockerfile installs `zip`, so the full archive-backup feature works in the container image without additional setup.

## Run with Node.js

```bash
git clone https://github.com/vladimirperovic/noema.git
cd noema
cp .env.example .env
node src/index.js
```

The default address is `http://localhost:3000`.

For a service manager such as systemd, run `node src/index.js` from the repository root and provide the same environment variables described in `.env.example`.

## Run with Docker

Build the image:

```bash
docker build -t noema:local .
```

Run it with a persistent data volume:

```bash
docker run -d \
  --name noema \
  --restart unless-stopped \
  -p 3000:3000 \
  -v noema-data:/app/data \
  --env-file .env \
  noema:local
```

The volume mounted at `/app/data` contains encrypted JSON stores, uploaded documents, image collections, snapshots, and generated local keys. Do not deploy the container without persistent storage.

## Coolify and similar platforms

Use the repository's Dockerfile and configure:

- exposed/internal port: `3000`;
- health check: `/healthz`;
- persistent storage: a volume mounted at `/app/data`;
- public URL: the final HTTPS address in `PUBLIC_BASE_URL`;
- all secrets through the platform's environment-variable interface.

Do not store production secrets in `.env` inside the repository.

When changing repositories or deployment sources, preserve the existing `/app/data` volume and encryption settings. A new empty volume creates a separate Noema installation.

## Reverse proxy and HTTPS

For an internet-facing deployment:

1. terminate TLS at a trusted reverse proxy;
2. forward requests to Noema on its internal port;
3. set `PUBLIC_BASE_URL` to the exact external HTTPS URL;
4. restrict `NOEMA_CORS_ORIGIN` to the expected browser origin;
5. enable `UI_PASSWORD` and `NOEMA_API_TOKEN`;
6. keep MCP and OpenAPI access limited to clients you trust.

Noema should not be exposed directly on an unencrypted public HTTP port.

## Required security values

Generate separate high-entropy values for:

- `UI_PASSWORD` — protects browser access;
- `NOEMA_API_TOKEN` — protects machine tools and integrations;
- `ENCRYPTION_KEY` — derives the encryption key for local JSON data.

Store the encryption key in a password manager and in a protected recovery record. Losing it can make encrypted application data unrecoverable.

## Persistent data and permissions

The application process must be able to create and modify `/app/data`. The included Dockerfile runs as the non-root `node` user and prepares that directory accordingly.

Back up the entire data volume, not only individual JSON files. Uploaded media and local keys may live in subdirectories.

## Updates

Before updating:

1. create an application backup;
2. take a platform or volume snapshot;
3. record the current image or commit SHA;
4. deploy the new version;
5. verify `/healthz`, login, task access, uploads, and restore visibility.

Keep a rollback path to the previous image or commit.

## Verification checklist

After deployment, verify:

- `/healthz` returns a successful response;
- the UI requires authentication when configured;
- task dates use the expected timezone;
- the `data/` volume remains populated after a redeploy;
- uploads and image collections persist;
- both JSON export and full ZIP archive backup work in a test environment;
- optional Calendar, analytics, MCP, and OpenAPI integrations only expose intended data.

See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), and [CUSTOMIZATION.md](CUSTOMIZATION.md) before production use.
