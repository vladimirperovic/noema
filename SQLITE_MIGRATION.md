# SQLite migration

Noema 0.2 moves structured workspace data from independent in-memory maps with encrypted JSON persistence to one local SQLite database.

## Runtime requirement

Direct Node.js deployments require Node.js **22.16.0 or newer**. The included Docker image uses Node.js 24.

## First start

On the first start after upgrading:

1. Noema creates `data/noema.sqlite`.
2. Existing encrypted JSON files are imported automatically when the matching SQLite collection is empty.
3. A migration marker is written inside SQLite so the same legacy file is not imported repeatedly.
4. The original JSON files are not deleted or renamed.

The imported collections are:

- `todos.json`;
- `notes.json`;
- `documents.json`;
- `links.json`;
- `inspirations.json`;
- `buildingsites.json`.

Uploaded media remains in its existing directories and is not copied into SQLite.

## Encryption

SQLite stores record identifiers, collection names, and timestamps as database metadata. Each record payload is encrypted with the existing AES-256-GCM key before it is written to SQLite. The same `ENCRYPTION_KEY` and `data/master.key` rules continue to apply.

Changing or losing `ENCRYPTION_KEY` or `data/master.key` can make both SQLite records and encrypted JSON mirrors unreadable. Back up the key material together with application data.

## Rollback

Noema continues updating the encrypted JSON files as compatibility mirrors. To return to a version before the SQLite migration:

1. stop Noema cleanly;
2. deploy the previous commit or image;
3. keep the same `data/` directory and encryption configuration;
4. start the previous version.

The previous version ignores `noema.sqlite` and reads the current JSON mirrors.

Do not run an old and a new Noema process against the same `data/` directory at the same time.

## Restore behavior

The JSON export/import and metadata snapshot APIs remain the portable restore format. Full ZIP archives continue to include the encrypted JSON compatibility files and uploaded media.

When manually replacing the complete `data/` directory with an older archive, stop Noema first. If the archive does not contain `noema.sqlite`, remove the existing SQLite database before starting the new version so that the restored JSON files can be imported.

## Verification

After upgrading, verify that:

- `data/noema.sqlite` exists;
- tasks, notes, documents, links, inspirations, and building sites are visible;
- creating and editing one record survives a restart;
- JSON and ZIP backups can still be downloaded;
- the encryption key is included in the disaster-recovery plan.
