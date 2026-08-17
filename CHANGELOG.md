# Changelog

All notable changes to Noema are documented here.

## Unreleased

### Changed

- Prepared the public core for a future thin private-overlay deployment model without moving private-only Invoice, Invest, branding, menu links, or infrastructure into the public repository.
- Added runtime data-root preparation so installations can keep the persistent data directory outside the source checkout without legacy relative-path assumptions.
- Added versioned GHCR container publishing for tagged/manual public core images.
- Upgraded Files storage to support bounded-memory raw uploads, authenticated chunk encryption, and HTTP Range downloads while retaining legacy base64 compatibility.
- Switched new `NOEMA-ASSET-V1` chunks to the compact raw AES-GCM chunk envelope and kept read compatibility with the earlier 42-byte chunk envelope.
- Added bulk/nested-safe SQLite transaction helpers and an in-memory collection cache with batched upsert/delete support.

### Tests

- Added regression coverage proving older `NOEMA-ASSET-V1` chunk containers remain readable after the compact chunk upgrade.

