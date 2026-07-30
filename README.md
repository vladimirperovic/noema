# Noema

> νοήματος — *that which is held in mind.*

**Noema is a small, self-hosted personal workspace built around one deliberate constraint: only yesterday, today, and tomorrow matter on the active task board.**

> [!IMPORTANT]
> **Noema is published as a reference application and a starting point for customization.** It is not intended to be installed and used unchanged as a universal productivity product. Fork it, rename the modules, remove what you do not need, change the data model, and adapt the interface to your own work and habits.

Noema is written in vanilla Node.js and exposes the same data to its web interface, MCP clients, OpenAPI-compatible agents, Siri Shortcuts, and other tools.

## The three-day idea

Most task managers accumulate an increasingly large backlog. Noema deliberately keeps the active surface small:

- **Yesterday** shows what was scheduled one day ago.
- **Today** is the current working list.
- **Tomorrow** is the immediate next step.
- A task older than yesterday **disappears from the three-column board**, but it is **not deleted**. It remains available in **Archive**, together with its original date and completion state.

This makes the main screen a short-term attention window rather than a permanent database. Archive keeps the full history without allowing old tasks to dominate the daily interface.

![Noema task board](docs/screenshots/home.png)

## What is included

### Task board

The home page is the core of Noema. Tasks are grouped into yesterday, today, and tomorrow, with priority, optional time, subtasks, drag-and-drop ordering, completion state, and recurring schedules.

The current implementation is intentionally opinionated. A fork can easily change the window to seven days, projects, contexts, people, rooms, construction phases, or any other grouping.

### Archive

Archive is the long-term memory of the application. Tasks that leave the three-day board remain here instead of being destroyed. The calendar also surfaces dates containing notes, documents, saved links, and snapshots.

### Notes

Notes are lightweight checklist-style records for information that is more structured than a task but does not need a full document. They support titles, body content, labels, pinning, archiving, and checklist items.

Possible adaptations include meeting notes, shopping lists, punch lists, inspection lists, recipes, recurring procedures, or quick client briefs.

### Documents

Documents are longer rich-text records with labels and file uploads. They are useful for specifications, project briefs, decisions, instructions, reports, contracts, research, or any content that should live beside the daily workflow.

The document module is deliberately simple and can be replaced with Markdown, a database-backed editor, object storage, collaborative editing, or an external document service.

### Links

Links is a personal link inbox. A URL can be saved with its title, description, preview image, label, archive state, and searchable metadata. Noema can collect links through the browser bookmarklet, iOS/macOS Shortcuts, REST, MCP, or OpenAPI tools.

This module can become a reading list, research library, product catalog, client references, supplier directory, property shortlist, or any other URL-based collection.

### AI Projects

AI Projects is a separate link collection for prompts, conversations, experiments, tools, repositories, and ongoing AI work. It demonstrates how one storage module can expose multiple purpose-specific collections.

A fork can rename it to Research, Clients, Cases, Opportunities, Resources, or remove it entirely.

### Inspiration

Inspiration is an image-first reference library with multi-image collections, thumbnails, labels, address/source fields, filtering, search, and a selectable cover image.

It was designed for architectural and design references, but the same module can store materials, furniture, art, fashion, recipes, products, travel ideas, visual research, mood boards, or any other image collection.

### Building Sites

Building Sites is a location-aware photo journal. Each entry can contain a title, location, address, coordinates, documentation link, label, hashtags, multiple images, image notes, and hotspots.

The name reflects the original use case, not a technical limitation. The module can be repurposed for:

- renovation or maintenance progress;
- field inspections and site visits;
- properties and real-estate listings;
- warehouses, equipment, or inventory locations;
- events and travel journals;
- deliveries, installations, defects, or service records;
- any collection that combines a place, photos, tags, and chronological observations.

### Backup and snapshots

Backup provides JSON export/import, archive downloads, local metadata snapshots, storage statistics, and snapshot restore. Metadata snapshots cover every structured module but intentionally exclude uploaded media; use the full ZIP archive for a complete media backup. Application data and uploaded media live in the local `data/` directory, which is excluded from Git.

The full ZIP archive feature uses the system `zip` command. It is installed by the included Dockerfile; direct Node.js deployments need `zip` available on the host. JSON export and import do not require it.

This implementation is suitable for a single-user self-hosted application. Production forks should define their own retention, off-site backup, encryption-key recovery, and disaster-recovery policies.

### Stats and SEO dashboard

Stats is an optional example dashboard for Google Analytics 4, Search Console, and PageSpeed data. The public version uses environment-based project configuration and contains no personal domains or property IDs.

It can be removed or adapted for sales, health, finance, home automation, server monitoring, project KPIs, or any other metrics.

### Help, authentication, and integrations

Noema also includes:

- a built-in Help page;
- optional password protection for the web UI;
- bearer-token protection for machine tools;
- AES-256-GCM encryption for local JSON data;
- optional read-only Google Calendar integration;
- an MCP endpoint for compatible AI clients;
- an auto-generated OpenAPI 3.1 document;
- health and system-status endpoints.

## Screenshots

The public application is served in English. `public/noema-i18n.js` localizes interface chrome and date formatting while explicitly excluding task titles, notes, documents, links, and other user-created content. Screenshots are generated from neutral demo data by `scripts/capture-screenshots.mjs`; they never use a personal `data/` directory.

| Page | Preview |
|---|---|
| Task board | ![Task board](docs/screenshots/home.png) |
| Archive | ![Archive](docs/screenshots/archive.png) |
| Notes | ![Notes](docs/screenshots/notes.png) |
| Documents | ![Documents](docs/screenshots/documents.png) |
| Links | ![Links](docs/screenshots/links.png) |
| AI Projects | ![AI Projects](docs/screenshots/ai-projects.png) |
| Inspiration | ![Inspiration](docs/screenshots/inspiration.png) |
| Building Sites | ![Building Sites](docs/screenshots/building-sites.png) |
| Backup | ![Backup](docs/screenshots/backup.png) |
| Stats | ![Stats](docs/screenshots/stats.png) |
| Help | ![Help](docs/screenshots/help.png) |
| Login | ![Login](docs/screenshots/login.png) |
| Not found | ![404](docs/screenshots/404.png) |

## Quick start

Requirements: **Node.js 20 or newer**. The optional full ZIP archive-backup feature also needs the system `zip` command; the included Docker image already provides it.

```bash
git clone https://github.com/vladimirperovic/noema.git
cd noema
cp .env.example .env
node src/index.js
```

Open `http://localhost:3000`.

No build step or npm dependency installation is required.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Public URL used by OpenAPI and OAuth |
| `NOEMA_API_TOKEN` | empty | Bearer token for MCP, OpenAPI tools, and machine access |
| `UI_PASSWORD` | empty | Password protecting the browser UI |
| `ENCRYPTION_KEY` | empty | Passphrase used to derive the local data-encryption key |
| `NOEMA_TIMEZONE` | `UTC` | IANA timezone used for date boundaries |
| `NOEMA_DATA_DIR` | `./data` | Persistent data, uploads, snapshots, tokens, and local encryption-key directory |
| `NOEMA_CORS_ORIGIN` | `*` | Allowed browser origin(s) |
| `NOEMA_HTTP_USER_AGENT` | generic Noema identifier | Operator contact sent to services that require an identifiable user agent |
| `NOEMA_ANALYTICS_PROJECTS` | empty | JSON array defining optional analytics projects |
| `GOOGLE_CLIENT_ID` | empty | Optional Google Calendar OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | empty | Optional Google Calendar OAuth client secret |
| `GOOGLE_CALENDAR_ID` | `primary` | Calendar to read |
| `GOOGLE_REFRESH_TOKEN` | empty | Optional manually supplied refresh token |
| `GA4_CLIENT_EMAIL` | empty | Optional Google service-account email |
| `GA4_PRIVATE_KEY` | empty | Optional Google service-account private key |
| `PAGESPEED_API_KEY` | empty | Optional PageSpeed API key |

See `.env.example` for explanations and examples.

## MCP and OpenAPI

- MCP endpoint: `POST /mcp`
- OpenAPI document: `GET /openapi.json`
- Tool REST bridge: `POST /api/tools/<tool-name>`

Example MCP configuration:

```json
{
  "mcpServers": {
    "noema": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Project structure

```text
src/
  config.js              environment parsing and validation
  core/                  auth, MCP, OpenAPI, validation, shared utilities
  modules/               registered tools
  services/              optional external services and analytics
  store/                 encrypted local stores
  server.js              HTTP, REST, static files, uploads, backup
public/                   browser interface
scripts/                  maintenance and screenshot tooling
test/                     Node.js tests
docs/                     architecture, customization, and screenshots
data/                     local encrypted data and uploads; never committed
```

## Customize before deployment

At minimum, review:

1. module names and navigation;
2. the three-day task behavior;
3. authentication and reverse-proxy settings;
4. backup and encryption-key recovery;
5. external integrations;
6. demo content and screenshots;
7. privacy, retention, and access requirements for your deployment.

Read [CUSTOMIZATION.md](CUSTOMIZATION.md), [DEPLOYMENT.md](DEPLOYMENT.md), [PRIVACY.md](PRIVACY.md), and [SECURITY.md](SECURITY.md) before exposing a fork to the internet.

## Development

```bash
npm run check
```

The check command validates the main JavaScript files and runs the complete test suite.

## Documentation

- [Product definition](PRODUCT.md)
- [Customization guide](CUSTOMIZATION.md)
- [Deployment guide](DEPLOYMENT.md)
- [Privacy and data flows](PRIVACY.md)
- [Architecture](ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Support](SUPPORT.md)
- [Changelog](CHANGELOG.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## License

MIT © Vladimir Perović. See [LICENSE](LICENSE).

The software is provided **as is**, without warranty. The repository is a customizable reference implementation, not a hosted service or supported commercial product.
