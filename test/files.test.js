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
    env: { ...process.env, NODE_ENV: "test", NOEMA_DATA_DIR: dataDir, NOEMA_TIMEZONE: "UTC", ENCRYPTION_KEY: "files-test-key" },
  });
}

test("Files metadata and binary content survive CRUD operations", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-files-"));
  try {
    const result = run(path.join(cwd, "data"), `
      import assert from "node:assert/strict";
      const { config } = await import(${JSON.stringify(moduleUrl("../src/config.js"))});
      const { initCrypto } = await import(${JSON.stringify(moduleUrl("../src/store/crypto.js"))});
      initCrypto(config.ENCRYPTION_KEY);
      const files = await import(${JSON.stringify(moduleUrl("../src/store/files.js"))});
      files.loadFiles();
      const created = files.addFile({ name: "brief.txt", description: "First revision", mimeType: "text/plain", data: Buffer.from("hello").toString("base64") });
      assert.equal(files.listFiles().length, 1);
      assert.equal(files.readFileContent(created.id).data.toString(), "hello");
      const updated = files.updateFile(created.id, { name: "project-brief.txt", description: "Approved" });
      assert.equal(updated.description, "Approved");
      const replaced = files.replaceFileContent(created.id, { name: "project-brief.pdf", mimeType: "application/pdf", data: Buffer.from("pdf-data").toString("base64") });
      assert.equal(replaced.name, "project-brief.pdf");
      assert.equal(files.readFileContent(created.id).data.toString(), "pdf-data");
      assert.throws(() => files.addFile({ name: "empty.txt", data: "" }), /base64/);
      assert.equal(files.removeFile(created.id), true);
      assert.equal(files.getFile(created.id), undefined);
      files.closeFiles();
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
