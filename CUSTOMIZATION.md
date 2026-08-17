# Customizing Noema

Noema is intentionally built from plain HTML, CSS, and JavaScript. Most visual and product changes can be made without a build system.

## Public core and private overlays

The public repository is the canonical generic Noema core. Installation-specific code should be layered outside the public source instead of maintaining a full private fork.

Keep generic capabilities such as Tasks, Notes, Documents, Links, Files, galleries, storage, encryption, backup, authentication, MCP/OpenAPI and shared UI infrastructure in the public core. Keep operator-specific modules, branding, private network links and organization-specific workflows in a private overlay or deployment repository.

A private deployment may build from a pinned public Noema container image and add its private modules/configuration during its own image build. Pin a version or immutable image digest rather than cloning public `main` at deploy time so production remains reproducible.

Runtime user data is separate from both source layers and belongs in `NOEMA_DATA_DIR` on persistent storage. Full encrypted `.noema` backups should be kept independently from the live volume.

## Canonical navigation

The shared menu, theme controls, footer, font scaling, active-page color, and WIDTH behavior live in:

```text
public/noema-header-footer.js
```

Edit the `pages` array to add, remove, rename, or reorder generic modules. Keep private hostnames and installation-specific tools out of the public repository; configure them in a private overlay or local extension.

The script removes legacy duplicate menu controls and renders one canonical instance on every page. The top menu and theme buttons are attached to the viewport layer rather than the scrolling page shell, so custom page layouts should not reposition them. Public gallery mode intentionally renders only Building Site and Inspiration links.

## Active state and menu rhythm

The active route uses the reddish accent `#d97757`. The NOEMA home label remains gold. Library links use one compact flex-column gap and explicitly reset inherited margins so old page-level menu CSS cannot spread them apart.

## Theme, font size, WIDTH, and Links view

Browser preferences are stored under:

- `noema-theme-manual`
- `noema-page-width`
- `noema-font-scale`
- `noema-links-columns-v1`
- `noema-links-view-v1`

WIDTH sets `data-width="wide"` on the root element. Shared CSS expands supported page containers to 92% of the viewport. New page layouts should use one of the existing container classes (`.wrap`, `.board-inner`, `.grid`, `.panel`, `.library-tools`) or add their selector to the wide-mode rule.

Links uses a persistent 3–6 cards-per-row preference plus Cards/Table mode. Those controls and the compact title/description rules live in `public/links-enhancements.js`, while the underlying link records remain unchanged.

## Styling tokens

Pages use a common family of variables:

```css
--paper
--paper-2
--paper-3
--ink
--ink-2
--ink-3
--ink-4
--ink-line
--ink-line-2
--beacon
--beacon-2
--beacon-soft
--signal
--ember
--azure
--font-display
--font-sans
--font-mono
--maxw
--gut
```

Preserve these names when adding a page so the shared controls and both themes work without special cases.

## Adding a generic module

1. Add its HTML/JS under `public/`.
2. Add API/storage code under `src/`.
3. Add the clean route to `src/server.js` when it is not served by a gateway.
4. Add the page to the shared menu and service-worker asset list.
5. Add syntax and behavior tests.
6. Update README, Product, Architecture, Privacy, Security, Support, Deployment, and Changelog when relevant.

Installation-specific modules should instead live in the private overlay and attach through the deployment's extension layer; they should not require copying the whole public source tree.

## Files module

Files is split between:

- `public/files.html` — interface
- `src/file-library.js` — metadata/legacy compatibility routes
- `src/streaming-file-library.js` — bounded-memory raw upload and Range download routes
- `src/store/files.js` — encrypted metadata and binary storage

Change `MAX_FILE_BYTES` only after also adjusting request limits, reverse-proxy upload limits, documentation, and tests. Binary names must remain randomized and path-normalized.

## Links module

The base Links page remains `public/links.html`. Cross-cutting visual controls are layered by `public/links-enhancements.js` so Cards/Table mode, density, and thumbnail actions can evolve without rewriting the stored link schema.

Local screenshot generation is handled server-side by `src/link-thumbnails.js`. Keep the URL preflight and authenticated delivery intact when customizing it.

## Source-linked tasks

`public/source-task-buttons.js` discovers supported records and adds Task actions. `public/source-task-navigation.js` protects linked-task navigation, note deep links, the Links existing-label picker, and shared browser-control fixes. Source types must also be accepted by `src/store/todos.js`.

A source-linked task should remain a reference: do not allow a normal task-title edit to silently detach it from its source.

## Internationalization

Existing interface localization is handled by `public/noema-i18n.js`. New stable user-facing strings should be added there when the page participates in automatic localization. Security and API error messages should remain clear and avoid exposing internal paths or secrets.

## Branding and examples

Use neutral example domains, projects, locations, and analytics IDs in public code. Real domains, property IDs, account emails, proxy addresses, private network URLs and organization-specific modules belong in deployment configuration or a private overlay.
