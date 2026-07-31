# Customizing Noema

Noema is intentionally built from plain HTML, CSS, and JavaScript. Most visual and product changes can be made without a build system.

## Canonical navigation

The shared menu, theme controls, footer, font scaling, active-page color, and WIDTH behavior live in:

```text
public/noema-header-footer.js
```

Edit the `pages` array to add, remove, rename, or reorder private modules. Each entry contains a route, label, and outline SVG icon. Keep private hostnames and installation-specific tools out of the public repository; configure them in a private fork or a local extension.

The script removes legacy duplicate menu controls and renders one canonical instance on every page. Public gallery mode intentionally renders only Building Site and Inspiration links.

## Active state and menu rhythm

The active route uses the reddish accent `#d97757`. The NOEMA home label remains gold. Library links use one compact flex-column gap and explicitly reset inherited margins so old page-level menu CSS cannot spread them apart.

## Theme, font size, and WIDTH

Browser preferences are stored under:

- `noema-theme-manual`
- `noema-page-width`
- `noema-font-scale`

WIDTH sets `data-width="wide"` on the root element. Shared CSS expands supported page containers to 92% of the viewport. New page layouts should use one of the existing container classes (`.wrap`, `.board-inner`, `.grid`, `.panel`, `.library-tools`) or add their selector to the wide-mode rule.

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

## Adding a module

1. Add its HTML/JS under `public/`.
2. Add API/storage code under `src/`.
3. Add the clean route to `src/server.js` when it is not served by a gateway.
4. Add the page to the shared menu and service-worker asset list.
5. Add syntax and behavior tests.
6. Update README, Product, Architecture, Privacy, Security, Support, Deployment, and Changelog when relevant.

## Files module

Files is split between:

- `public/files.html` — interface
- `src/file-library.js` — authenticated routes
- `src/store/files.js` — encrypted metadata and binary storage

Change `MAX_FILE_BYTES` only after also adjusting the request limit in `src/file-library.js`, reverse-proxy upload limits, documentation, and tests. Binary names must remain randomized and path-normalized.

## Source-linked tasks

`public/source-task-buttons.js` discovers supported records and adds Task actions. `public/source-task-navigation.js` protects linked-task navigation and note deep links. Source types must also be accepted by `src/store/todos.js`.

A source-linked task should remain a reference: do not allow a normal task-title edit to silently detach it from its source.

## Internationalization

Existing interface localization is handled by `public/noema-i18n.js`. New stable user-facing strings should be added there when the page participates in automatic localization. Security and API error messages should remain clear and avoid exposing internal paths or secrets.

## Branding and examples

Use neutral example domains, projects, locations, and analytics IDs in public code. Real domains, property IDs, account emails, proxy addresses, and private network URLs belong in `.env` or a private fork.
