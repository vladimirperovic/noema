# Support

## Before asking for help

1. Confirm the deployed commit in the footer build badge or `build-version.json`.
2. Run `npm run check` against the same source revision.
3. Review container/application logs from startup through the failing request.
4. Reproduce with browser extensions disabled and a hard refresh.
5. Remove secrets, tokens, private URLs, personal files and production IDs before sharing logs/screenshots.

Public issues are suitable for reproducible bugs and documentation problems. Security reports belong in the private process described in [SECURITY.md](SECURITY.md).

## Application does not start in production

Noema 0.3 intentionally refuses incomplete production configuration. Check for messages about:

- missing/weak `UI_PASSWORD`;
- missing/weak `NOEMA_API_TOKEN`;
- non-HTTPS `PUBLIC_BASE_URL`;
- wildcard `NOEMA_CORS_ORIGIN`;
- short `NOEMA_BACKUP_PASSWORD`;
- invalid session lifetime configuration;
- unreadable/mismatched encrypted data or migration state.

Use `.env.example` as the current reference. `ALLOW_INSECURE_NO_AUTH=true` is for isolated development only.

## Browser shows a username/password popup

Current Noema does not use HTTP Basic Auth for browser login and does not intentionally emit `WWW-Authenticate`.

If a browser-native username/password popup appears:

1. confirm the deployed commit is current;
2. inspect reverse-proxy auth middleware — the proxy itself may be issuing a Basic challenge;
3. verify an older Noema container is not still receiving traffic;
4. hard-refresh/unregister an old Service Worker if the visible UI is stale;
5. capture the response headers for the request that triggered the popup, but remove cookies/tokens before sharing them.

Normal Noema login happens at `/login` with the `UI_PASSWORD` form only.

## Login loops, migration or unexpected expiry

- Confirm the browser reaches the same HTTPS origin configured in `PUBLIC_BASE_URL`.
- Verify the reverse proxy preserves cookies and does not rewrite paths.
- Check `SESSION_IDLE_HOURS` and `SESSION_ABSOLUTE_HOURS`.
- Changing `UI_PASSWORD` invalidates existing sessions by design.
- Clear the site cookie and log in again after changing domains/TLS settings.
- For an old two-secret installation, keep the existing `ENCRYPTION_KEY` only during the controlled migration and remove it after successful restart/login/data validation.
- Preserve `NOEMA_DATA_DIR/master.key`; the password alone cannot recreate a lost random installation data key.

## Rate limiting shows the proxy address

Configure the immediate reverse-proxy IP in `NOEMA_TRUSTED_PROXY_IPS`. Do not add broad client networks. If the proxy runs in Docker, inspect the actual bridge/source address seen by the Noema container.

## UI looks stale after an upgrade

The Service Worker now caches only a small static allow-list and deletes historical Noema caches when a new cache version activates.

If a browser still shows an old shell/menu after deployment:

1. reload normally once;
2. hard-refresh;
3. if needed, unregister the old Noema Service Worker and clear Cache Storage for the site;
4. reload and confirm the footer build commit matches the deployed revision.

Private/API/File/gallery responses should not be present in Service Worker Cache Storage in the current version.

## Files page is missing

- Confirm the deployment includes version 0.3 or newer.
- Open `/files` directly while logged in.
- Verify `src/index.js` installs `installFileLibrary`.
- Check that `NOEMA_DATA_DIR` is writable/persistent.
- Confirm the Service Worker/UI shell is current.

## File upload fails

- The public application limit is 120 MB per file.
- The current public Files API uses base64 JSON, so the HTTP request is larger than the original file; configure reverse-proxy body limits accordingly.
- Confirm free disk space and write permissions for `NOEMA_DATA_DIR/files`.
- Check for a 413 response from the reverse proxy before the request reaches Noema.
- Do not manually rename UUID-backed Files objects inside the data directory.

## Links thumbnails are missing

Automatic browser-based thumbnail generation is intentionally disabled in the standard Noema container. A generate request should fail closed until an isolated renderer exists.

Existing encrypted thumbnail files are still served to authenticated users. If an existing thumbnail is missing:

- confirm the encrypted file exists below `NOEMA_DATA_DIR/link-thumbnails`;
- confirm the saved Link metadata references the expected thumbnail;
- verify the request is made from an authenticated UI session;
- check storage ownership/permissions;
- do not install Chromium into the main container merely to bypass the disabled renderer boundary.

## Links Cards/Table or density setting resets

Display preferences are stored in browser local storage. Clearing site data, private-browsing restrictions or storage-blocking settings reset them.

## Menu is duplicated, inconsistent or scrolls away

The current version generates one canonical navigation system from shared browser modules. Confirm every page loads the current shared script, remove private custom duplicate navigation and refresh the Service Worker/UI shell.

## WIDTH button is active but the page is not wider

Current code sets `data-width="wide"`. A custom page must use a supported container selector or add its main container to the shared wide-mode CSS rule.

## Theme or font size does not persist

Check whether the browser blocks local storage. Clearing site data resets UI-only preferences.

## Linked task does not open its source

- Confirm the task contains server-side `source` metadata.
- Confirm source-task controllers load successfully.
- The source record may have been deleted/restored under another ID.
- Linked task titles are intentionally read-only; edit the source record instead.

## Recurring task duplicates or wrong day around DST

Current builds use deterministic recurrence occurrence IDs and timezone-aware calendar-day arithmetic.

If you see duplicates after upgrading:

- confirm the deployed commit includes the current recurrence model;
- inspect whether the data was already duplicated by an older version before migration;
- verify `NOEMA_TIMEZONE` is a valid IANA zone such as `Europe/Belgrade`;
- run `npm run check` — the regression suite includes recurrence idempotency and 23/25-hour DST transition coverage.

## Gallery share is invalid or expired

Share links expire and may be revoked/restricted to one module/album. Generate a new link from an authenticated administrator session. Ensure the copied URL includes the complete share token and the proxy does not strip its query string.

## Calendar cannot connect

- Verify Google OAuth client ID/secret and the exact callback URL.
- Start the flow while logged into the same Noema browser session.
- OAuth state is short-lived and session-bound.
- The refresh token should be stored encrypted in the data directory.
- Revoke an old Google grant and retry if Google does not return a refresh token.

## Backup download fails

Full encrypted archive creation requires:

- `NOEMA_BACKUP_PASSWORD` of at least 12 characters;
- `zip` and `unzip` installed (included in the Docker image);
- enough disk/temporary space;
- readable persistent directories;
- a valid authenticated admin session for browser backup operations.

Portable JSON excludes the complete binary data set. Use the `.noema` archive for full recovery.

## Restore guidance

Stop Noema before restoring a full archive. Run:

```bash
npm run restore -- archive.noema target-directory
```

Then start Noema against the restored directory and test login, representative records, Files, galleries, Calendar and a new backup. Preserve the prior data directory until the restore is proven.

## SQLite errors

- Preserve the complete data directory, including SQLite/key material and WAL files during a live copy.
- Prefer a clean shutdown and full `.noema` archive.
- Check disk space, ownership, filesystem support and concurrent processes.
- Never run two Noema instances against the same local SQLite directory.

## Docker/Coolify build fails

Find the **first application error** in the Docker build, not only the final `exit status 1` wrapper.

The Dockerfile runs `npm run check` and a production startup smoke test during build. A failure is intentional: the image should not deploy if source/tests/startup are broken.

Useful clues include:

- syntax/test file and assertion;
- missing Alpine package;
- invalid build-only test configuration;
- production startup configuration error;
- health check failure.

Build-time tests clear deployment secrets and use isolated test credentials, so a Coolify runtime password should not normally change test semantics.

## Public screenshots

Public repository screenshots are generated from neutral demo records. If the screenshot workflow fails:

- verify `npm run check` first;
- confirm the workflow can install Playwright Chromium;
- confirm the checkout `data/` directory is empty;
- inspect `scripts/capture-screenshots.mjs` for the first page/route that failed;
- never use a production data directory to generate public screenshots.

## Useful diagnostics

```bash
node --version
npm run check
curl -i http://127.0.0.1:3000/healthz
find "$NOEMA_DATA_DIR" -maxdepth 2 -type f -printf '%p %s bytes\n'
```

Do not post `.env`, cookies, authorization headers, encryption keys, backup passwords, share URLs or data-directory contents publicly.
