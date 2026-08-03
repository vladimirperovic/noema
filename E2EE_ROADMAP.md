# Noema Web/PWA + client-side E2EE

> Status: planned security architecture; not yet implemented.

Noema currently encrypts data at rest on the server. The planned next security layer is client-side end-to-end encryption (E2EE) for sensitive Notes and Files so that plaintext content never needs to reach the Noema server.

## Target architecture

- Keep Noema as the same responsive web application on iPhone, macOS, Windows, and desktop browsers, with optional PWA installation directly from the browser. No App Store distribution is required for the web/PWA version.
- Generate and keep the Noema master encryption key on trusted client devices. The plaintext master key must never be sent to or stored by the Noema server.
- Encrypt note titles/bodies and file contents in the browser before upload using authenticated encryption such as AES-256-GCM through the Web Crypto API.
- Decrypt data only on the client after download. The server, database, snapshots, backups, and hosting provider should see ciphertext rather than plaintext note/file content.
- Store only a password-wrapped/encrypted key bundle on the server so a new trusted device can be enrolled without storing the plaintext master key on the server.
- Support secure multi-device use, for example iPhone + desktop, through explicit device enrollment, recovery material, or a protected key-transfer flow such as QR-based pairing.
- Preserve the existing server-side encryption as defense in depth for server-managed data and for encrypted E2EE payloads at rest.
- Encrypt files in chunks/streams so large uploads/downloads do not require the complete file to be held in browser memory.
- Keep search for E2EE Notes client-side after decryption; the server must not receive plaintext content or a plaintext search index.
- Version all encrypted envelopes and bind authenticated context such as record type, record ID, and format version so ciphertext cannot be silently swapped between records.
- Provide a safe migration path for existing Notes and Files: read the current format, re-encrypt client-side, verify integrity, then replace the server copy without data loss.

## Intended data flow

```text
Trusted client (iPhone / desktop browser)
        |
        | plaintext exists only here
        v
client-side encrypt
        |
        | ciphertext only
        v
HTTPS -> Noema server -> SQLite / files / backup / snapshot
        |
        | ciphertext only
        v
client download -> local decrypt -> display
```

## Threat model

Browser/PWA E2EE is intended to protect against database leaks, copied server disks, snapshots, backups, and passive access to hosting-provider storage because those systems should contain only ciphertext.

A web/PWA client still receives executable JavaScript from the hosting server. A fully compromised application-delivery server could theoretically serve malicious JavaScript designed to capture a key after the user unlocks Noema. Therefore browser/PWA E2EE is not the strongest possible zero-trust model against a malicious server actively changing the client code.

If protection against a malicious application-delivery server becomes a requirement, a separately installed and signed local/native client can be considered later. That is not required for the initial Web/PWA E2EE design.
