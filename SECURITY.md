# Security Policy

Noema is a customizable single-user reference application. Its security model must be reviewed and adapted before a fork is exposed to the public internet.

## Supported versions

Security fixes are applied to the latest version on the default branch. Older forks and modified deployments are maintained by their owners.

## Reporting a vulnerability

Do not publish credentials, private data, exploit details, or active vulnerabilities in a public issue.

Use GitHub's private vulnerability-reporting feature for this repository when available. Include:

- affected commit or version;
- deployment assumptions;
- reproduction steps;
- expected and actual behavior;
- impact;
- suggested mitigation, if known.

Please allow a reasonable period for investigation before public disclosure.

## Deployment requirements

Before internet exposure:

1. set a strong `UI_PASSWORD`;
2. set a separate high-entropy `NOEMA_API_TOKEN`;
3. set and securely back up `ENCRYPTION_KEY`;
4. use HTTPS behind a maintained reverse proxy;
5. restrict `NOEMA_CORS_ORIGIN` to the real application origin;
6. restrict network access where possible;
7. review all routes that intentionally remain public;
8. remove unused integrations and modules;
9. keep Node.js and the host operating system patched;
10. implement off-site backups and test restoration.

## Secrets

Never commit:

- `.env` files;
- API tokens;
- OAuth client secrets;
- service-account private keys;
- refresh tokens;
- passwords;
- private domains or internal hostnames;
- personal analytics property IDs;
- production data or uploaded media.

If a secret is committed, removing it in a later commit is insufficient. Revoke or rotate it and rewrite repository history before publication.

## Encryption limitations

Local JSON data is encrypted with AES-256-GCM, but this does not protect against an attacker who has access to the running process, environment variables, encryption key, unlocked host account, or decrypted backups.

Back up the encryption key separately. Losing the key can make encrypted data unrecoverable.

## Authentication limitations

The included login system is intended for a personal application. It is not a complete identity platform and does not provide user accounts, roles, MFA, SSO, password recovery, organization policies, or per-record authorization.

Use an external identity-aware proxy or replace the auth layer when those controls are required.

## Uploads and external content

Uploaded files and fetched metadata must be treated as untrusted. A production fork should review size limits, MIME validation, image processing, content security policy, antivirus scanning, storage permissions, outbound-request restrictions, and retention.

## Backup safety

Backups can contain all user content. Encrypt backup destinations, restrict access, define retention, and test restore procedures. Do not publish screenshots or example archives generated from a personal `data/` directory.

## Dependency and code scanning

The runtime has no external packages, but development workflows may install tools such as Playwright. Review workflow dependencies, pin actions to maintained versions, and enable GitHub secret scanning and CodeQL where available.