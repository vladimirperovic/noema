# Contributing to Noema

Thank you for improving Noema. Contributions should preserve its small, self-hosted, dependency-light character and its security boundary.

## Before opening a change

- Search existing issues and pull requests.
- Keep examples generic. Do not commit real credentials, domains, account IDs, personal files, private network addresses, or production screenshots containing private data.
- Discuss large architecture or storage changes before implementation.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md), not in a public issue.

## Development setup

```bash
cp .env.example .env
# Set ENCRYPTION_KEY and either configure authentication or use
# ALLOW_INSECURE_NO_AUTH=true only for isolated local development.
npm run check
npm run dev
```

Node.js 22.16 or newer is required.

## Required checks

Before submitting:

```bash
npm run check
docker build -t noema-test .
```

`npm run check` includes syntax checks for server, browser, security, storage, backup, and script modules plus all Node tests. The Docker build additionally performs a strict production startup and health check.

## Change expectations

### Storage and security

Changes to records, authentication, sharing, uploads, paths, or backups require tests for successful behavior and failure behavior. Keep path normalization, size limits, authenticated encryption, timing-safe secret comparison, session expiry, and trusted-proxy assumptions intact.

Do not store readable secrets in SQLite, JSON mirrors, logs, browser storage, or repository files.

### UI

Preserve both themes, mobile layouts, keyboard access, the canonical menu, active-page state, font controls, and WIDTH mode. New pages should use existing CSS variables and load `/noema-header-footer.js`.

Do not add a second independent navigation implementation. Extend the canonical page list instead.

### Source-linked tasks

When adding a new source type, update the backend accepted source types, source-task browser controller, deep-link behavior, styling, and tests. Source-linked task titles must remain references rather than ordinary editable task text.

### Files and uploads

Keep untrusted names separate from filesystem paths. Binary writes should be atomic. Any file-size change must be reflected in the API limit, proxy guidance, tests, README, Product, Deployment, Privacy, Security, and Support documents.

### Documentation

User-visible behavior changes must update all affected Markdown documentation and `CHANGELOG.md`. Configuration changes must also update `.env.example`.

## Code style

- Use modern ECMAScript modules.
- Prefer built-in Node APIs over new dependencies.
- Keep functions focused and errors actionable without leaking sensitive internals.
- Validate at boundaries and normalize before persistence.
- Use English for public code, examples, API errors, and documentation.
- Add comments for security invariants and non-obvious compatibility behavior, not for every line.

## Tests

Tests use `node:test` and should isolate data under a temporary `NOEMA_DATA_DIR`. Use subprocesses when environment configuration or module-level state must be tested independently.

Relevant test areas include:

- encrypted SQLite and legacy import;
- Files CRUD and binary replacement;
- server-side sessions and gallery shares;
- production fail-closed configuration;
- stable recurring tasks and source metadata;
- outbound URL restrictions and analytics normalization;
- backup manifest and restore behavior.

## Pull requests

A pull request should explain:

- what changes for users;
- security and privacy impact;
- storage or migration impact;
- tests performed;
- documentation updated;
- rollback considerations.

Keep commits understandable and avoid unrelated formatting changes. Maintainers may request that a large change be split into smaller reviews.
