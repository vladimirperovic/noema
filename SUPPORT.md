# Support

Noema is an open-source reference application and customization base. It is not a hosted service, commercial product, or guaranteed support offering.

## Good places for questions

Use GitHub Discussions when enabled for:

- setup questions;
- customization ideas;
- architecture discussions;
- examples of adapted forks;
- help understanding an existing module.

Use GitHub Issues for reproducible defects and clearly scoped feature proposals.

## Before asking for help

Please include:

- Node.js version;
- operating system or container platform;
- the relevant commit or version;
- sanitized configuration names, never secret values;
- exact reproduction steps;
- expected and actual behavior;
- logs with tokens, paths, domains, addresses, and personal data removed.

Run `npm run check` and confirm whether the problem also occurs in a clean checkout with an empty `data/` directory.

## What is outside project support

Repository maintainers cannot operate or secure individual deployments. Deployment-specific responsibilities include:

- reverse proxies and TLS;
- DNS and networking;
- backups and key recovery;
- OAuth and analytics-account configuration;
- migration of private data;
- custom forks and third-party integrations;
- incident response;
- legal or regulatory compliance.

## Security reports

Do not post vulnerabilities or credentials publicly. Follow `SECURITY.md`.