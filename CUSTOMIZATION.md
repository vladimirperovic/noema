# Customizing Noema

Noema is intended to be forked and reshaped. The current interface is one person's working system, published as a reference implementation rather than a universal product.

## Start with the workflow, not the labels

Before changing code, decide what the active screen should help you notice. Noema currently uses a rolling three-day window:

- yesterday;
- today;
- tomorrow.

Tasks older than yesterday are omitted from the active board but remain in Archive. This is the central design choice, not a technical requirement.

Possible alternatives include:

- seven calendar days;
- now, next, later;
- inbox, active, waiting;
- project phases;
- rooms or buildings;
- clients or team members;
- urgent, scheduled, someday.

The date model lives primarily in `src/store/todos.js`, while the active-window filtering is applied by the `/api/todos` route in `src/server.js`.

## Module-by-module ideas

### Task board

Change the task fields, grouping, recurrence rules, priorities, or retention window. A fork could add owners, projects, durations, dependencies, reminders, attachments, or external issue IDs.

### Archive

Archive can remain a historical calendar or become a searchable event log, audit trail, completed-work report, timesheet, activity feed, or export center.

### Notes

The Notes module can become:

- checklists;
- meeting notes;
- inspection lists;
- shopping lists;
- standard operating procedures;
- snag or punch lists;
- client requests.

### Documents

The Documents module can hold briefs, reports, specifications, decisions, contracts, research, recipes, manuals, or project records. Replace the editor or storage layer if you need Markdown, collaboration, versioning, object storage, or full-text search.

### Links

Links can be adapted into a reading list, research library, supplier directory, product catalog, property shortlist, press archive, client references, or bookmarks for a team.

### AI Projects

AI Projects demonstrates a second collection built on the Links storage model. Rename it to any domain-specific collection or remove it from navigation.

### Inspiration

Inspiration is a generic image-library pattern. It can store architecture, materials, furniture, fashion, art, food, travel, products, photography references, mood boards, or visual research.

Useful extensions include ratings, dominant colors, source attribution, copyright status, similarity search, and project assignment.

### Building Sites

Building Sites combines a location, metadata, tags, images, image annotations, and a documentation link. It is suitable for many use cases beyond construction:

- property inspections;
- renovation progress;
- maintenance records;
- field-service visits;
- warehouses and equipment;
- events and travel diaries;
- deliveries and installations;
- defects and quality-control evidence;
- landscape, agriculture, or environmental observations.

Rename the route, navigation label, store, and API resource to match the new domain. The current implementation is a reusable gallery-and-location pattern.

### Backup

The included backup flow is local and single-user oriented. A production fork may add scheduled off-site copies, retention policies, encrypted remote storage, integrity checks, key escrow, and restore drills.

### Stats

The Stats page is an example external-data dashboard. Define projects through `NOEMA_ANALYTICS_PROJECTS` or replace the service with metrics from your own domain.

Potential replacements include sales, budgets, fitness, home automation, server health, project delivery, inventory, or support metrics.

## Branding and navigation

The browser UI is in `public/`. Search for visible labels such as `Noema`, `Inspiration`, and `Building Sites`, then update navigation, headings, empty states, help content, and page titles consistently.

Do not change only the menu label while leaving API names and documentation misleading. Prefer a complete domain rename when publishing a specialized fork.

## Storage

Noema uses encrypted JSON files and local media directories under `data/`. This is understandable and portable for a personal application, but it is not designed for concurrent multi-user writes.

Consider SQLite or PostgreSQL when adding:

- multiple users;
- concurrent editing;
- permissions;
- large datasets;
- advanced search;
- audit requirements;
- transactional workflows.

Keep the store API stable so UI and tool layers do not need to know which database is used.

## Integrations

All external credentials belong in environment variables. Never place real domains, analytics property IDs, OAuth secrets, service-account keys, tokens, user names, addresses, or private URLs in committed source code.

The public analytics configuration uses a JSON environment variable. Example:

```env
NOEMA_ANALYTICS_PROJECTS=[{"id":"example","name":"example.com","url":"https://example.com","ga4PropertyId":"123456789","gscSites":["sc-domain:example.com"],"brandTerms":["example"],"color":"#64748b","badge":"EX"}]
```

## Security checklist before deployment

- Set a strong `UI_PASSWORD`.
- Set independent `NOEMA_API_TOKEN` and `ENCRYPTION_KEY` values.
- Use HTTPS through a trusted reverse proxy.
- Restrict CORS to the real origin.
- Back up the encryption key separately from encrypted data.
- Review public routes and gallery-sharing behavior.
- Remove modules and integrations you do not use.
- Run the test suite and a secret scan.
- Read `SECURITY.md`.

## Keep your fork maintainable

Document intentional differences from upstream. Prefer small modules, configuration over hard-coded values, neutral demo data, and tests for every changed behavior. A fork that clearly states its domain assumptions is more useful than a generic interface with hidden personal rules.