# Privacy and data flows

Noema is self-hosted. The operator chooses the server, domain, reverse proxy, storage, backups, and optional external integrations. The project does not run a hosted Noema service and does not receive installation data by default.

## Data stored locally

Depending on enabled modules, Noema stores:

- task titles, dates, priorities, completion, recurrence, subtasks, and source references;
- notes and document content;
- saved links and fetched metadata;
- Files names, descriptions, types, sizes, and binary content;
- Building Sites and Inspiration metadata, images, thumbnails, locations, tags, and hotspots;
- optional analytics project configuration from environment variables;
- hashed UI sessions and hashed gallery-share tokens;
- encrypted Google Calendar refresh token;
- encrypted metadata snapshots and optional full encrypted backup archives.

Metadata records are encrypted before storage in SQLite. Compatibility JSON mirrors, sessions, shares, and the Calendar token are encrypted at rest. Binary files are stored in installation-controlled directories; file names on disk are randomized where the Files module manages them.

## Browser storage

The UI may keep non-secret preferences and mappings in browser storage, including:

- manual theme choice;
- page-width choice;
- font scale;
- source-task link mapping used to reconcile older linked tasks.

Authentication uses an HttpOnly session cookie. Gallery sharing uses an HttpOnly share cookie after a valid share URL is opened. Browser scripts cannot read these cookies.

## External requests

Noema may contact external services only when their feature is used or configured:

- Google OAuth and Google Calendar API for read-only calendar events;
- Google Analytics Data API, Search Console, and PageSpeed when Stats is configured;
- OpenStreetMap/Nominatim and map tile providers for location features;
- target websites when link metadata or readable article text is requested;
- remote image/media URLs supplied by users.

External services receive the normal request metadata associated with HTTP access, such as the installation IP address, configured user agent, requested URL, and any service-specific credentials. Review each provider’s privacy policy before enabling an integration.

## Calendar credentials

OAuth client credentials usually come from environment variables. A refresh token obtained through the browser flow is encrypted in `google-token.enc`. OAuth state is short-lived and bound to the administrator session that initiated the flow.

## Public gallery links

Gallery links contain a high-entropy random token. Only its SHA-256 hash is stored. A link has an expiration time, can be revoked, and may be restricted to Building Sites, Inspiration, or one album.

Anyone who possesses an unexpired link can access its allowed public gallery data. Treat the URL as a bearer secret and revoke it when no longer needed.

## Files

Files is a private authenticated module. File metadata is included in portable metadata backups, but binary content is not. Full `.noema` archives include both metadata and binary content.

Operators should avoid uploading material they are not authorized to store. Noema does not provide client-side or end-to-end encryption; the running server can decrypt data for authenticated users.

## Logs

Application logs report startup, migration, configuration, and operational errors. They should not intentionally include passwords, bearer tokens, session values, share tokens, encryption keys, or file content. Reverse proxies and hosting platforms may maintain their own access logs.

## Deletion and retention

Deleting a record removes it from the active encrypted collection and refreshes its mirror. Files deletion also removes the managed binary. Backups and snapshots are separate copies and must be expired or destroyed according to the operator’s retention policy.

## Backups

Portable JSON contains readable metadata and should be protected like the original records. Full `.noema` archives are encrypted with a separate backup password but should still be stored with access controls and tested retention rules. Losing both the backup password and encryption material makes recovery impossible.

## Operator responsibilities

Operators are responsible for legal basis, consent, retention, TLS, host security, reverse-proxy logs, access control, third-party integrations, and secure disposal of backups and storage media.
