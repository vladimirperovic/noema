# Contributing to Noema

Thank you for improving Noema. Contributions should preserve its small, self-hosted, dependency-light character and its security boundary.

## Before opening a change

- Search existing issues and pull requests.
- Keep examples generic. Do not commit real credentials, domains, account IDs, personal files, private network addresses or production screenshots containing private data.
- Discuss large architecture/storage changes before implementation.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md), not in a public issue.

## Development setup

```bash
cp .env.example .env
# Normal local path: set UI_PASSWORD.
# For an isolated no-auth development instance only:
# ALLOW_INSECURE_NO_AUTH=true
npm run check
npm run dev
```

Node.js 22.16 or newer is required. CI and the public screenshot workflow use Node 24.

## Required checks

Before submitting:

```bash
npm run check
docker build -t noema-test .
```

`npm run check` includes syntax checks and Node regression tests. The Docker build also runs a strict production startup/health smoke test with isolated build credentials and removes package-manager tooling from the final runtime image.

## Change expectations

### Authentication and request gateways

`src/security-gateway.js` is the sole browser-auth authority. Do not reintroduce Basic-auth challenges, `WWW-Authenticate`, independent browser password checks or HMAC compatibility sessions inside `src/server.js`/inner middleware.

Inner modules should trust the authorization context produced by the outer gateway and still perform resource-level scope checks where needed.

### Storage and security

Changes to records, authentication, sharing, uploads, paths or backups require tests for successful and failure behavior. Preserve path normalization, size limits, authenticated encryption, timing-safe secret comparison, session expiry and trusted-proxy assumptions.

Do not store readable secrets in SQLite, JSON mirrors, logs, browser storage or repository files.

### Service Worker

The Service Worker is a static-shell cache only.

Do not add generic `response.ok` runtime caching. `/api`, Files, uploads, galleries, private media, thumbnails and backups must remain network-only. Security-sensitive cache changes should bump the cache version so historical Noema caches are removed during activation.

### UI

Preserve both themes, mobile layouts, keyboard access, the canonical menu, active-page state, font controls and WIDTH mode. New pages should reuse existing CSS variables/shared navigation rather than adding a second navigation implementation.

### Source-linked tasks

When adding a source type, update backend accepted types, browser source-task controller, deep-link behavior, styling and tests. Source-linked task titles remain references rather than ordinary editable task text.

### Recurring tasks and time

Recurrence changes must remain idempotent and timezone-aware. Tests should cover start-date behavior, repeated generation and DST boundaries for a real IANA timezone.

### Files and uploads

Keep untrusted names separate from filesystem paths. Binary writes should be atomic. Any file-size or payload-format change must be reflected in proxy guidance, tests, README, Product, Deployment, Privacy, Security and Support docs.

### Link thumbnails

Do not re-enable Chromium in the main Noema container as a shortcut. A future renderer must have a separately designed sandbox/network-egress boundary. Existing encrypted thumbnail serving should remain independent from generation.

### Documentation

User-visible behavior changes must update all affected Markdown documentation and `CHANGELOG.md`. Configuration changes must update `.env.example`.

Public screenshots are generated, not captured from a personal deployment.

## Public screenshots

The public repository uses `scripts/capture-screenshots.mjs` and `.github/workflows/screenshots.yml`.

The generator must:

- refuse a non-empty repository `data/` directory;
- create only neutral demo records;
- use test-only credentials/configuration;
- remove temporary data after capture;
- write only generated images to `docs/screenshots/`.

Do not replace these with screenshots of a real Noema installation.

## Code style

- Use modern ECMAScript modules.
- Prefer built-in Node APIs over new runtime dependencies.
- Keep functions focused and errors actionable without leaking sensitive internals.
- Validate at boundaries and normalize before persistence.
- Use English for public code, examples, API errors and documentation.
- Add comments for security invariants/non-obvious compatibility behavior, not every line.

## Tests

Tests use `node:test` and should isolate state below a temporary `NOEMA_DATA_DIR`. Use subprocesses when environment configuration or module-level state must be tested independently.

Relevant test areas include:

- encrypted SQLite and legacy import;
- Files CRUD/binary replacement;
- server-side sessions and gallery shares;
- production fail-closed configuration;
- auth-gateway/Basic-auth regressions;
- static-only Service Worker caching;
- recurring tasks and timezone/DST behavior;
- outbound URL restrictions;
- backup manifest/restore behavior.

## Pull requests

A pull request should explain:

- what changes for users;
- security/privacy impact;
- storage/migration impact;
- tests performed;
- documentation updated;
- rollback considerations.

Keep commits understandable and avoid unrelated formatting changes. Maintainers may request that a large change be split into smaller reviews.
