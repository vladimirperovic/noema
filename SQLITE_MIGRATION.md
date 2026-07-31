# SQLite migration

## Storage model

Noema uses one SQLite database at:

```text
NOEMA_DATA_DIR/noema.sqlite
```

The database contains generic encrypted records. Each record payload is serialized and encrypted with AES-256-GCM before it is written to SQLite. SQLite therefore provides transactions, indexes, WAL journaling, and concurrency handling without storing readable application content in record rows.

Current collections include:

- `todos`
- `notes`
- `documents`
- `links`
- `files`
- `inspirations`
- `buildingsites`
- `sessions`
- `gallery-shares`

Files and gallery binary content are not embedded into SQLite. Their encrypted or randomized metadata lives in SQLite while binary data stays in dedicated directories.

## Encryption key

The application initializes its storage key from `ENCRYPTION_KEY`. Existing installations may also have `noema-master.key` in the data directory. Treat either form as essential recovery material.

A database copied without its matching key cannot be decrypted. A key copied without the database and binary directories is not a backup.

## Legacy encrypted JSON migration

Each collection may have an encrypted compatibility mirror such as `notes.json`, `todos.json`, or `files.json`. On first load, when a SQLite collection is empty and its migration marker is absent, Noema imports the legacy array into SQLite and records a migration marker in `noema_meta`.

After mutations, Noema refreshes the encrypted mirror asynchronously. Mirrors exist for rollback and migration convenience; SQLite is the primary metadata store.

## Calendar token migration

Noema 0.3 stores the Google Calendar refresh token in:

```text
google-token.enc
```

If the older plaintext `google-token.json` exists, Noema reads it once, writes the encrypted replacement, and removes the plaintext file.

## Files migration

The Files module stores records in the `files` collection and binary data in:

```text
NOEMA_DATA_DIR/files/
```

Stored binary names are UUID-based and never derived directly from untrusted path input. Moving only Files metadata produces broken records; moving only the directory loses descriptions and original display names.

## WAL and shutdown

SQLite runs in WAL mode. A clean shutdown flushes collection mirrors, checkpoints the WAL, closes the database, and then closes the HTTP server. Container deployments should allow the process to receive `SIGTERM` and finish its shutdown period.

## Recommended migration procedure

1. Stop writes or schedule a short maintenance window.
2. Create a verified full `.noema` archive.
3. Upgrade Noema while preserving the complete data directory.
4. Start the new version and inspect logs for legacy import messages.
5. Verify task counts, Notes, Documents, Links, Files, galleries, login, and Calendar.
6. Keep the pre-upgrade archive until a restore test succeeds.

## Manual validation

Run:

```bash
npm run check
```

The SQLite test imports a legacy encrypted JSON file, writes encrypted rows, updates a record, checkpoints the database, confirms plaintext is not present in record payloads, and reopens the data in a second process. Additional tests cover Files, sessions, shares, recurrence, and production configuration.

## Recovery choices

- Use a **portable JSON backup** to restore supported metadata collections through the application.
- Use an encrypted **`.noema` disaster-recovery archive** to restore SQLite, encryption material, binary directories, galleries, uploads, and mirrors together.

For complete recovery, prefer the `.noema` archive and restore while the application is stopped.
