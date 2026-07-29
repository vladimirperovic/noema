# Contributing to Noema

Thank you for helping improve Noema. This repository is a customizable reference application, so contributions should keep the code understandable, neutral, and easy to adapt.

## Before opening a change

- Search existing issues and pull requests.
- Keep personal configuration and production data out of the repository.
- Discuss large architectural changes in an issue first.
- Prefer focused changes over broad rewrites.

## Local setup

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/vladimirperovic/noema.git
cd noema
cp .env.example .env
npm run check
node src/index.js
```

The runtime has no external package dependencies. Development-only workflows may install tools such as Playwright in CI.

## Branches and commits

Create a descriptive branch and use clear commit messages. Conventional prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:` are encouraged.

## Pull requests

A pull request should explain:

- what changed;
- why it changed;
- which user or developer behavior is affected;
- how it was tested;
- any privacy, migration, backup, or security implications;
- screenshots for visible interface changes.

Keep generated screenshots neutral. Never generate them from a personal `data/` directory.

## Code guidelines

- Use modern JavaScript modules.
- Prefer the Node.js standard library when practical.
- Keep environment access centralized in `src/config.js`.
- Keep storage behind functions in `src/store/`.
- Validate untrusted input at HTTP and tool boundaries.
- Do not hard-code domains, analytics IDs, coordinates, credentials, email addresses, internal hosts, or personal examples.
- Add or update tests for changed behavior.
- Update documentation when changing routes, configuration, modules, or data retention.

## Checks

Run:

```bash
npm run check
```

For visual changes, run the screenshot workflow in a clean checkout. `scripts/capture-screenshots.mjs` refuses to run when `data/` is not empty.

## Security issues

Do not open a public issue for an undisclosed vulnerability. Follow `SECURITY.md`.

## Conduct

Participation is governed by `CODE_OF_CONDUCT.md`.