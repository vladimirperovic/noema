# Architecture

Noema is a single-process, single-user reference application built with the Node.js standard library. It intentionally avoids a framework and runtime dependencies so the complete request path remains easy to inspect and modify.

## Design goals

- small, understandable codebase;
- self-hosted operation;
- one shared domain model for browser, REST, MCP, and OpenAPI clients;
- local-first storage;
- configuration through environment variables;
- replaceable modules rather than a fixed product taxonomy.

## Runtime layers

### Entry point

`src/index.js` starts the HTTP server and coordinates graceful shutdown.

### Configuration

`src/config.js` loads `.env` without an external package, validates basic values, and exports one frozen configuration object. Other modules should not read `process.env` directly.

### HTTP server

`src/server.js` contains:

- static-file delivery;
- REST routes;
- login and session handling;
- rate limiting;
- uploads and media delivery;
- gallery sharing;
- backup and restore;
- OAuth callbacks;
- MCP and tool routing.

A larger fork should split these responsibilities into focused route modules.

### Stores

`src/store/` contains in-memory maps backed by encrypted JSON files and local media directories.

The stores expose functions such as list, add, update, remove, load, replace, and close. This boundary is the best place to substitute SQLite, PostgreSQL, or another persistence layer.

### Tool registry

`src/core/registry.js` is the source of truth for machine-accessible tools. Registered schemas are used by both MCP and OpenAPI, reducing the chance that two integrations describe the same operation differently.

### Browser application

`public/` contains static HTML, CSS, and JavaScript. Pages fetch the same REST resources used by integrations.

### Optional services

`src/services/` contains code for external systems such as analytics. These integrations must remain optional and environment-configured.

## The task lifecycle

1. A task stores an absolute `scheduledFor` date.
2. The store derives its logical bucket relative to the current date.
3. The active `/api/todos` response includes only tasks scheduled from yesterday onward.
4. Older tasks are omitted from the three-column board.
5. `/api/archive` still returns the complete task history.

The task is therefore hidden from the attention view, not deleted from storage.

## Data directory

All user-generated state is kept under `data/`, including encrypted JSON stores, snapshots, uploaded files, inspiration media, and building-site media.

`data/` must never be committed. A deployment must back up both its data and the key material required to decrypt it.

## Authentication boundaries

Noema has two related but distinct access mechanisms:

- `UI_PASSWORD` protects the browser UI and normal REST resources;
- `NOEMA_API_TOKEN` protects machine tools that declare authentication requirements.

Some endpoints intentionally remain public, including health checks, OpenAPI metadata, OAuth callbacks, and login. Review this list before internet exposure.

## Encryption

JSON stores use AES-256-GCM. `ENCRYPTION_KEY` is used to derive a key; when it is absent, Noema creates local key material for convenience.

For a real deployment, explicitly set and securely back up `ENCRYPTION_KEY`. Encryption at rest does not replace operating-system permissions, HTTPS, authentication, or secure backups.

## Scaling limits

The included architecture is appropriate for a personal instance and educational fork. It does not provide:

- multi-user authorization;
- concurrent transactional writes;
- horizontal scaling;
- collaborative editing;
- distributed locks;
- background-job infrastructure;
- guaranteed remote backup;
- enterprise audit controls.

Add these deliberately rather than assuming the current implementation already provides them.

## Extension strategy

When adding a module:

1. define the data model and store boundary;
2. add REST routes;
3. create browser UI only after the API is stable;
4. register MCP/OpenAPI tools when machine access is useful;
5. add neutral demo data and tests;
6. document privacy, retention, and backup behavior.

Avoid embedding personal domains, property IDs, coordinates, email addresses, or credentials in source code. Use configuration and examples instead.