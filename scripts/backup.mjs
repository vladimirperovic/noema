import { writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { initCrypto } from "../src/store/crypto.js";
import { createEncryptedBackup, inspectEncryptedBackup } from "../src/store/backup.js";

initCrypto({ masterPassword: config.UI_PASSWORD, legacyPassword: config.ENCRYPTION_KEY });
const output = path.resolve(process.argv[2] || `noema_full_${new Date().toISOString().replace(/[:.]/g, "-")}.noema`);
const archive = createEncryptedBackup();
writeFileSync(output, archive, { mode: 0o600 });
const manifest = inspectEncryptedBackup(archive);
console.log(`[noema] encrypted backup written to ${output}`);
console.log(`[noema] ${manifest.files.length} files verified`);
