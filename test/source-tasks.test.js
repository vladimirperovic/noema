import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = (relativePath) => new URL(relativePath, import.meta.url).href;

function run(dataDir, source) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", NOEMA_DATA_DIR: dataDir, NOEMA_TIMEZONE: "UTC", ENCRYPTION_KEY: "source-task-test-key" },
  });
}

test("source tasks deduplicate, keep source metadata, and protect their titles", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-source-task-"));
  try {
    const result = run(path.join(cwd, "data"), `
      import assert from "node:assert/strict";
      const { config } = await import(${JSON.stringify(moduleUrl("../src/config.js"))});
      const { initCrypto } = await import(${JSON.stringify(moduleUrl("../src/store/crypto.js"))});
      initCrypto(config.ENCRYPTION_KEY);
      const todos = await import(${JSON.stringify(moduleUrl("../src/store/todos.js"))});
      todos.loadStore();
      const source = { type: "file", id: "file-1" };
      const marker = "\\u2063NOEMA_SOURCE:" + encodeURIComponent(JSON.stringify(source));
      const first = todos.addTask("Project brief\\n" + marker, "today", "normal");
      const second = todos.addTask("Another title\\n" + marker, "today", "normal");
      assert.equal(first.id, second.id);
      assert.deepEqual(first.source, source);
      const updated = todos.updateTask(first.id, { title: "Detached title", priority: "high" });
      assert.equal(updated.title, "Project brief");
      assert.equal(updated.priority, "high");
      todos.closeStore();
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("recurring occurrences are deterministic across repeated generation", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-recurrence-"));
  try {
    const result = run(path.join(cwd, "data"), `
      import assert from "node:assert/strict";
      const { config } = await import(${JSON.stringify(moduleUrl("../src/config.js"))});
      const { initCrypto } = await import(${JSON.stringify(moduleUrl("../src/store/crypto.js"))});
      initCrypto(config.ENCRYPTION_KEY);
      const todos = await import(${JSON.stringify(moduleUrl("../src/store/todos.js"))});
      todos.replaceTasks([{
        id: "daily-review-template",
        title: "Daily review",
        scheduledFor: "2026-07-30",
        priority: "normal",
        done: false,
        repeat: "daily",
        recurrenceTemplateId: "daily-review-template",
        occurrenceDate: "2026-07-30",
        subtasks: [],
        order: 1,
        createdAt: 1,
        updatedAt: 1
      }]);
      const instant = Date.parse("2026-07-31T10:00:00Z");
      assert.equal(todos.generateRecurring(instant), 1);
      assert.equal(todos.generateRecurring(instant), 0);
      const occurrences = todos.listTasks(undefined, { includeDone: true })
        .filter((task) => task.recurrenceTemplateId === "daily-review-template" && task.occurrenceDate === "2026-07-31");
      assert.equal(occurrences.length, 1);
      assert.equal(occurrences[0].repeat, "");
      todos.closeStore();
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
