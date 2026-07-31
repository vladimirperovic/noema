import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { restoreEncryptedBackup } from "../src/store/backup.js";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/restore.mjs <backup.noema> [target-data-dir]");
  process.exit(1);
}
const target = path.resolve(process.argv[3] || config.DATA_DIR);
const result = restoreEncryptedBackup(readFileSync(path.resolve(input)), config.NOEMA_BACKUP_PASSWORD, target);
console.log(`[noema] restored ${result.manifest.files.length} verified files to ${result.restoredTo}`);
if (result.previousData) console.log(`[noema] previous data kept at ${result.previousData}`);
