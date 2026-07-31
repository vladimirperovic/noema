## Summary

Describe the user-visible change and why it belongs in Noema.

## Scope

- [ ] UI / accessibility
- [ ] Tasks / recurrence / source links
- [ ] Notes / documents / links / files
- [ ] Galleries / sharing
- [ ] Authentication / security / privacy
- [ ] SQLite / migration / backup
- [ ] MCP / OpenAPI / external integration
- [ ] Documentation only

## Security and privacy

Explain changes to authentication, authorization, cookies, tokens, uploads, filesystem paths, outbound requests, encryption, logs, shares, backups, or external services. Write `None` only after reviewing these areas.

## Storage and migration

Describe new collections, fields, directories, environment variables, migration behavior, backup impact, and rollback considerations.

## Verification

- [ ] `npm run check`
- [ ] `docker build -t noema-test .`
- [ ] Light and dark themes checked
- [ ] Mobile layout checked
- [ ] Canonical menu and WIDTH control checked
- [ ] Login/logout checked when authentication changed
- [ ] Backup/restore impact checked when storage changed

Additional test evidence:

## Documentation

- [ ] README updated when user behavior changed
- [ ] `.env.example` updated when configuration changed
- [ ] Product, Architecture, Deployment, Privacy, Security, Support, SQLite Migration, Customization, and Contributing reviewed
- [ ] CHANGELOG updated

## Repository hygiene

- [ ] No credentials, private URLs, account IDs, personal files, production screenshots, or private network addresses were committed
- [ ] Examples are generic and safe for a public repository
- [ ] New browser pages load the canonical shared header/footer
- [ ] New modules include syntax and behavior tests
