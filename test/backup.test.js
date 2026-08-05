import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = (relativePath) => new URL(relativePath, import.meta.url).href;
const commandExists = (command) => spawnSync("sh", ["-c", `command -v ${command}`]).status === 0;

function run(dataDir, source) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      NOEMA_DATA_DIR: dataDir,
      UI_PASSWORD: "",
      ENCRYPTION_KEY: "archive-storage-key",
      NOEMA_BACKUP_PASSWORD: "archive-password-123",
    },
  });
}

test("full archive verifies checksums and restores encrypted binary data", { skip: !(commandExists("zip") && commandExists("unzip")) }, async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-backup-"));
  const dataDir = path.join(cwd, "data");
  const restoredDir = path.join(cwd, "restored");
  try {
    const result = run(dataDir, `
      import assert from "node:assert/strict";
      import { config } from ${JSON.stringify(moduleUrl("../src/config.js"))};
      import { initCrypto } from ${JSON.stringify(moduleUrl("../src/store/crypto.js"))};
      initCrypto(config.ENCRYPTION_KEY);
      const files = await import(${JSON.stringify(moduleUrl("../src/store/files.js"))});
      files.loadFiles();
      const created = files.addFile({ name: "drawing.txt", mimeType: "text/plain", data: Buffer.from("binary-content").toString("base64") });
      files.closeFiles();
      const backup = await import(${JSON.stringify(moduleUrl("../src/store/backup.js"))});
      const archive = backup.createEncryptedBackup();
      const manifest = backup.inspectEncryptedBackup(archive);
      assert.ok(manifest.files.some((entry) => entry.path.includes("files/")));
      const restored = backup.restoreEncryptedBackup(archive, config.NOEMA_BACKUP_PASSWORD, ${JSON.stringify(restoredDir)});
      assert.ok(restored.manifest.files.length > 0);
      const metadata = manifest.files.find((entry) => entry.path.includes("files/") && !entry.path.endsWith(".tmp"));
      assert.ok(metadata);
      console.log(JSON.stringify({ storedName: created.storedName, id: created.id }));
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const line = result.stdout.trim().split("\n").find((value) => value.startsWith("{"));
    const { storedName, id } = JSON.parse(line);
    const restoredFilePath = path.join(restoredDir, "files", storedName);
    await access(restoredFilePath, constants.R_OK);

    // A full backup restores the persistent storage representation, which must
    // remain ciphertext. Restore is not allowed to turn Files back into plaintext.
    const stored = await readFile(restoredFilePath);
    assert.equal(stored.subarray(0, 14).toString("utf8"), "NOEMA-FILE-V1\0");
    assert.equal(stored.includes(Buffer.from("binary-content")), false);

    // The restored data directory still decrypts to the exact original bytes
    // through Noema when the installation encryption key is initialized.
    const verify = run(restoredDir, `
      import assert from "node:assert/strict";
      import { config } from ${JSON.stringify(moduleUrl("../src/config.js"))};
      import { initCrypto } from ${JSON.stringify(moduleUrl("../src/store/crypto.js"))};
      initCrypto(config.ENCRYPTION_KEY);
      const files = await import(${JSON.stringify(moduleUrl("../src/store/files.js"))});
      files.loadFiles();
      const restored = files.readFileContent(${JSON.stringify(id)});
      assert.ok(restored);
      assert.equal(restored.data.toString(), "binary-content");
      files.closeFiles();
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(verify.status, 0, verify.stderr || verify.stdout);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("full archive rejects the wrong password", { skip: !(commandExists("zip") && commandExists("unzip")) }, async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-backup-password-"));
  try {
    const result = run(path.join(cwd, "data"), `
      import assert from "node:assert/strict";
      import { config } from ${JSON.stringify(moduleUrl("../src/config.js"))};
      import { initCrypto } from ${JSON.stringify(moduleUrl("../src/store/crypto.js"))};
      initCrypto(config.ENCRYPTION_KEY);
      const backup = await import(${JSON.stringify(moduleUrl("../src/store/backup.js"))});
      const archive = backup.createEncryptedBackup();
      assert.throws(() => backup.inspectEncryptedBackup(archive, "wrong-password-123"), /incorrect|damaged/);
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
