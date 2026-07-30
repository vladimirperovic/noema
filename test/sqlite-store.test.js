import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = (relativePath) => new URL(relativePath, import.meta.url).href;

function runStorageScript(dataDir, body) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", body], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      NOEMA_DATA_DIR: dataDir,
      NOEMA_TIMEZONE: "UTC",
      ENCRYPTION_KEY: "sqlite-test-key",
    },
  });
}

test("SQLite imports legacy encrypted JSON, persists encrypted rows, and keeps rollback mirrors current", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-sqlite-"));
  const dataDir = path.join(cwd, "data");
  try {
    const first = runStorageScript(dataDir, `
      import assert from "node:assert/strict";
      import path from "node:path";
      import { existsSync } from "node:fs";
      const { config } = await import(${JSON.stringify(moduleUrl("../src/config.js"))});
      const crypto = await import(${JSON.stringify(moduleUrl("../src/store/crypto.js"))});
      crypto.initCrypto(config.ENCRYPTION_KEY);
      crypto.writeEncryptedJson(path.join(config.DATA_DIR, "notes.json"), [
        { id: "legacy-note", title: "Legacy", body: "Imported body", labels: [], createdAt: 1, updatedAt: 1 }
      ]);

      const notes = await import(${JSON.stringify(moduleUrl("../src/store/notes.js"))});
      notes.loadNotes();
      assert.equal(notes.listNotes().length, 1);
      const added = notes.addNote("SQLite note", "Body", ["test"], true, false);
      notes.updateNote(added.id, { body: "Updated body" });
      notes.closeNotes();

      const todos = await import(${JSON.stringify(moduleUrl("../src/store/todos.js"))});
      todos.loadStore();
      const recurring = todos.addTask("Weekday task", "yesterday", "normal", false, null, "weekdays");
      assert.doesNotThrow(() => todos.generateRecurring(Date.parse("2026-07-30T10:00:00Z")));
      assert.ok(todos.getTask(recurring.id));
      todos.closeStore();

      const database = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      database.checkpointDatabase();
      assert.ok(existsSync(path.join(config.DATA_DIR, "noema.sqlite")));

      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(path.join(config.DATA_DIR, "noema.sqlite"), { readOnly: true });
      const rows = db.prepare("SELECT collection, payload FROM noema_records ORDER BY collection").all();
      assert.ok(rows.some((row) => row.collection === "notes"));
      assert.ok(rows.every((row) => !row.payload.includes("SQLite note")));
      db.close();

      const mirror = crypto.readEncryptedJson(path.join(config.DATA_DIR, "notes.json"), []);
      assert.equal(mirror.length, 2);
      assert.equal(mirror.find((note) => note.id === added.id).body, "Updated body");
      database.closeDatabase();
    `);
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const second = runStorageScript(dataDir, `
      import assert from "node:assert/strict";
      const { config } = await import(${JSON.stringify(moduleUrl("../src/config.js"))});
      const { initCrypto } = await import(${JSON.stringify(moduleUrl("../src/store/crypto.js"))});
      initCrypto(config.ENCRYPTION_KEY);
      const notes = await import(${JSON.stringify(moduleUrl("../src/store/notes.js"))});
      notes.loadNotes();
      assert.equal(notes.listNotes().length, 2);
      assert.equal(notes.listNotes().find((note) => note.title === "SQLite note").body, "Updated body");
      notes.closeNotes();
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(second.status, 0, second.stderr || second.stdout);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
