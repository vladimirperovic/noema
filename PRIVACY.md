# Privacy and data flows

Noema is self-hosted software. The repository author does not operate a central Noema service and does not receive data from installations created by other users.

The person or organization running a Noema deployment is responsible for its privacy policy, access controls, legal basis, retention rules, backups, and any disclosures required in its jurisdiction.

## Data stored locally

Depending on the modules used, Noema may store:

- tasks, subtasks, dates, priorities, and completion state;
- notes and checklist content;
- rich-text documents and uploaded files;
- saved URLs, titles, descriptions, images, labels, and extracted article text;
- AI-project collection items;
- Inspiration collections and uploaded images;
- Building Sites entries, addresses, coordinates, tags, image notes, and hotspots;
- backup snapshots and storage metadata;
- optional OAuth refresh tokens and locally generated encryption material.

Runtime data is stored under `data/`, which is excluded from Git. JSON stores are encrypted at rest by the application, but uploaded media and operational access still require appropriate host, volume, and backup protection.

## Optional external requests

Some features send information to third-party services when enabled or used:

### Google Calendar

The optional Calendar integration uses Google's OAuth and Calendar APIs with a read-only scope. Calendar identifiers, OAuth credentials, and refresh tokens are controlled by the deployment owner.

### Analytics, Search Console, and PageSpeed

The optional Stats module can request data from Google Analytics 4, Search Console, and PageSpeed. Projects are defined through `NOEMA_ANALYTICS_PROJECTS`; the public repository contains no personal property IDs.

### Link metadata and article reading

When a URL is saved or opened through applicable link tools, the Noema server may request that remote URL to retrieve metadata or article text. The remote website can observe the deployment server's IP address and request headers.

### Reverse geocoding

When reverse geocoding is used, coordinates are sent to the configured external geocoding service. The current implementation uses OpenStreetMap Nominatim. Do not submit sensitive locations without understanding the service's policies and usage requirements.

### MCP, OpenAPI, Siri, and AI clients

MCP, OpenAPI, REST tools, Shortcuts, and AI clients can receive or modify Noema data according to the tools and credentials provided to them. Treat every connected client as a party with potential access to the data exposed by those tools.

## Authentication is not multi-user authorization

Noema is designed primarily as a single-user reference application. `UI_PASSWORD` and `NOEMA_API_TOKEN` provide access gates, but they are not a complete multi-user identity, role, or permission system.

A fork intended for teams, clients, tenants, regulated data, or public registration should implement a proper authorization model and audit trail.

## Logs and infrastructure

Noema itself does not provide a hosted telemetry service. However, the host, reverse proxy, container platform, DNS provider, CDN, monitoring tools, and backup system may log requests, IP addresses, domains, error messages, or operational metadata.

Review and configure those systems separately.

## Backups and deletion

Deleting an item from the active interface may not immediately remove every copy from:

- Archive views;
- local snapshots;
- downloaded backups;
- platform volume snapshots;
- off-site backups;
- infrastructure logs.

Deployment owners should define retention and deletion procedures appropriate for their use case.

## Public screenshots and demo data

Repository screenshots are generated in a clean checkout with neutral synthetic content. The screenshot script refuses to run when an existing `data/` directory contains files, reducing the risk of publishing a user's private workspace.

## Before production use

Review:

1. which modules and integrations are enabled;
2. what data each integration sends externally;
3. who can reach the web UI and machine endpoints;
4. how secrets and encryption keys are stored;
5. how long backups and logs are retained;
6. whether the deployment needs a formal privacy notice, consent flow, data-processing agreement, or deletion procedure.

See [SECURITY.md](SECURITY.md) and [DEPLOYMENT.md](DEPLOYMENT.md).
