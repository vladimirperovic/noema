# Support

## Before asking for help

1. Confirm the deployed commit in the footer build badge or `build-version.json`.
2. Run `npm run check` against the same source revision.
3. Review container/application logs from startup through the failing request.
4. Reproduce with browser extensions disabled and a hard refresh.
5. Remove secrets, tokens, private URLs, personal files, and production IDs before sharing logs or screenshots.

Public issues are suitable for reproducible bugs and documentation problems. Security reports belong in the private process described in [SECURITY.md](SECURITY.md).

## Application does not start in production

Noema 0.3 intentionally refuses incomplete production configuration. Check for messages about:

- missing `UI_PASSWORD`;
- missing `NOEMA_API_TOKEN`;
- non-HTTPS `PUBLIC_BASE_URL`;
- wildcard `NOEMA_CORS_ORIGIN`;
- short `NOEMA_BACKUP_PASSWORD`;
- idle session lifetime exceeding absolute lifetime.

Use `.env.example` as the current reference. The insecure override is for isolated development only.

## Login loops, encryption migration, or unexpected expiry

- Confirm the browser reaches the same HTTPS origin configured in `PUBLIC_BASE_URL`.
- Verify the reverse proxy preserves cookies and does not rewrite paths.
- Check `SESSION_IDLE_HOURS` and `SESSION_ABSOLUTE_HOURS`.
- Changing `UI_PASSWORD` invalidates existing sessions by design.
- Clear the site cookie and log in again after changing domains or TLS settings.
- On an installation upgrading from the old two-secret model, keep the existing `ENCRYPTION_KEY` for the first startup, sign in once with the normal `UI_PASSWORD`, restart successfully, and only then remove the legacy variable.
- Preserve `NOEMA_DATA_DIR/master.key`; the password alone cannot recreate a lost random installation data key.

## Rate limiting shows the proxy address

Configure the immediate reverse-proxy IP in `NOEMA_TRUSTED_PROXY_IPS`. Do not add broad client networks. If the proxy runs in Docker, inspect the actual bridge/source address seen by the Noema container.

## Files page is missing

- Confirm the deployment includes version 0.3 or newer.
- Open `/files` directly while logged in.
- Verify `src/index.js` installs `installFileLibrary`.
- Check that `NOEMA_DATA_DIR` is writable and persistent.
- Update the service worker with a hard refresh or clear the site’s cached data after an upgrade.

## File upload fails

- The application limit is 120 MB per file.
- Base64 JSON makes the HTTP request larger than the original file; raise reverse-proxy body limits accordingly.
- Confirm free disk space and write permissions for `NOEMA_DATA_DIR/files`.
- Check for a 413 response from the proxy before the request reaches Noema.
- Do not manually rename UUID files inside the Files directory.

## Links thumbnails are missing or fail to generate

- The Generate thumbnails action only targets links whose `image` field is currently empty.
- The Docker image includes Chromium. On a non-Docker install, confirm Chromium/Chrome is installed; use `NOEMA_CHROMIUM_PATH` only if Noema cannot find the executable automatically.
- Check write permissions and free space for `NOEMA_DATA_DIR/link-thumbnails`.
- Private/local URLs are intentionally rejected by the outbound safety checks.
- Instagram and other login-gated/anti-bot sites may produce a login, cookie, or challenge screen instead of the expected post preview.
- If generation succeeds but the old fallback remains visible, hard-refresh the Links page.
- Generated thumbnails require an authenticated UI session and are not public static files.

## Links Cards/Table or density setting resets

The Links page stores non-secret display preferences in browser local storage under `noema-links-columns-v1` and `noema-links-view-v1`. Clearing site data, private-browsing restrictions, or storage-blocking browser settings reset them.

## Menu is duplicated, inconsistent, or scrolls away

The current version generates one canonical menu from `public/noema-header-footer.js`, removes legacy duplicates, and moves the top menu/theme controls into the viewport layer. Confirm every page loads the shared script, clear an old service-worker cache, and verify no private customization injects or repositions a second menu afterward.

## WIDTH button is active but the page is not wider

Current code sets `data-width="wide"`, not a valueless attribute. Confirm the deployed shared-header version is current. A custom page must use a supported container selector or add its main container to the shared wide-mode CSS rule.

## Theme or font size does not persist

Check whether the browser blocks local storage. Preferences are saved as `noema-theme-manual`, `noema-page-width`, and `noema-font-scale`. Clearing site data resets them.

## Linked task does not open its source

- Confirm the task contains server-side `source` metadata.
- Confirm source-task controllers load successfully.
- The source record may have been deleted or restored under another ID.
- Older local-only links are reconciled when the task/source pages load.
- Linked task titles are intentionally read-only; edit the source record instead.

## Gallery share is invalid or expired

Share links expire and may be revoked or limited to one module/album. Generate a new link from an authenticated administrator session. Ensure the copied URL includes the complete `gallery` token and that proxy URL rewriting does not remove its query string.

## Calendar cannot connect

- Verify Google OAuth client ID/secret and the exact callback URL.
- Start the flow while logged into the same Noema browser session.
- OAuth state expires after ten minutes and cannot be completed from another session.
- The refresh token should appear as encrypted `google-token.enc` in the data directory.
- Revoke an old Google grant and retry if Google does not return a refresh token.

## Backup download fails

Full encrypted archive creation requires:

- `NOEMA_BACKUP_PASSWORD` of at least 12 characters;
- `zip` and `unzip` installed (included in the Docker image);
- enough temporary and persistent disk space;
- readable persistent directories.

Portable JSON excludes binary contents. Use the `.noema` archive for full recovery. Full archives include generated Links thumbnail PNGs because they live inside the persistent data directory.

## Restore guidance

Stop Noema before restoring a full archive. Run `npm run restore -- archive.noema target-directory`, inspect the verified file count, start the application against the restored directory, and test login, records, Files, Links, galleries, Calendar, and backups. The restore tool keeps the previous target directory for rollback.

## SQLite errors

- Preserve the complete data directory, including SQLite, key material, and WAL files during a live copy.
- Prefer a clean shutdown and full `.noema` archive.
- Check disk space, ownership, filesystem support, and concurrent processes.
- Never run two Noema instances against the same local SQLite directory.

## Useful diagnostics

```bash
node --version
npm run check
curl -i http://127.0.0.1:3000/healthz
find "$NOEMA_DATA_DIR" -maxdepth 2 -type f -printf '%p %s bytes\n'
```

For thumbnail issues on a non-Docker host, also verify the configured browser path:

```bash
printf '%s\n' "${NOEMA_CHROMIUM_PATH:-auto-detect}"
```

Do not post `.env`, cookies, authorization headers, encryption keys, backup passwords, share URLs, or data-directory contents publicly.
