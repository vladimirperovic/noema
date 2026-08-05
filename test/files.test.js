import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = (relativePath) => new URL(relativePath, import.meta.url).href;

function run(dataDir, body) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", body], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", NOEMA_DATA_DIR: dataDir, NOEMA_TIMEZONE: "UTC", UI_PASSWORD: "", ENCRYPTION_KEY: "files-test-key" },
  });
}

test("Files metadata and binary content survive CRUD operations encrypted at rest", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-files-"));
  try {
    const result = run(path.join(cwd, "data"), `
      import assert from "node:assert/strict";
      import { readFileSync } from "node:fs";
      import path from "node:path";
      const { config } = await import(${JSON.stringify(moduleUrl("../src/config.js"))});
      const { initCrypto, isEncryptedBuffer } = await import(${JSON.stringify(moduleUrl("../src/store/crypto.js"))});
      initCrypto(config.ENCRYPTION_KEY);
      const files = await import(${JSON.stringify(moduleUrl("../src/store/files.js"))});
      files.loadFiles();
      const created = files.addFile({ name: "brief.txt", description: "First revision", mimeType: "text/plain", data: Buffer.from("hello-private-file").toString("base64") });
      const stored = readFileSync(path.join(config.DATA_DIR, "files", created.storedName));
      assert.equal(isEncryptedBuffer(stored), true);
      assert.equal(stored.includes(Buffer.from("hello-private-file")), false);
      assert.equal(files.listFiles().length, 1);
      assert.equal(files.readFileContent(created.id).data.toString(), "hello-private-file");
      const updated = files.updateFile(created.id, { name: "project-brief.txt", description: "Approved" });
      assert.equal(updated.description, "Approved");
      const replaced = files.replaceFileContent(created.id, { name: "project-brief.pdf", mimeType: "application/pdf", data: Buffer.from("pdf-private-data").toString("base64") });
      assert.equal(replaced.name, "project-brief.pdf");
      const replacedStored = readFileSync(path.join(config.DATA_DIR, "files", replaced.storedName));
      assert.equal(isEncryptedBuffer(replacedStored), true);
      assert.equal(replacedStored.includes(Buffer.from("pdf-private-data")), false);
      assert.equal(files.readFileContent(created.id).data.toString(), "pdf-private-data");
      assert.throws(() => files.addFile({ name: "empty.txt", data: "" }), /base64/);
      assert.equal(files.removeFile(created.id), true);
      assert.equal(files.getFile(created.id), null);
      files.closeFiles();
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("legacy plaintext Files binary is migrated in place", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-files-legacy-"));
  try {
    const result = run(path.join(cwd, "data"), `
      import assert from "node:assert/strict";
      import { readFileSync, writeFileSync } from "node:fs";
      import path from "node:path";
      const { config } = await import(${JSON.stringify(moduleUrl("../src/config.js"))});
      const { initCrypto, isEncryptedBuffer } = await import(${JSON.stringify(moduleUrl("../src/store/crypto.js"))});
      initCrypto(config.ENCRYPTION_KEY);
      const files = await import(${JSON.stringify(moduleUrl("../src/store/files.js"))});
      files.loadFiles();
      const created = files.addFile({ name: "legacy.txt", data: Buffer.from("temporary").toString("base64") });
      const target = path.join(config.DATA_DIR, "files", created.storedName);
      writeFileSync(target, Buffer.from("legacy-plaintext-secret"));
      files.closeFiles();
      files.loadFiles();
      const raw = readFileSync(target);
      assert.equal(isEncryptedBuffer(raw), true);
      assert.equal(raw.includes(Buffer.from("legacy-plaintext-secret")), false);
      assert.equal(files.readFileContent(created.id).data.toString(), "legacy-plaintext-secret");
      files.closeFiles();
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
