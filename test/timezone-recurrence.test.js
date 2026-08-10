import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addIsoDays, zonedDayBoundsUTC } from "../src/core/utils.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const todosUrl = new URL("../src/store/todos.js", import.meta.url).href;
const cryptoUrl = new URL("../src/store/crypto.js", import.meta.url).href;
const databaseUrl = new URL("../src/store/database.js", import.meta.url).href;

test("Europe/Belgrade day bounds stay correct on both DST transitions", () => {
  const spring = zonedDayBoundsUTC("2026-03-29", "Europe/Belgrade");
  assert.equal(spring.timeMin, "2026-03-28T23:00:00.000Z");
  assert.equal(spring.timeMax, "2026-03-29T21:59:59.999Z");
  assert.equal(Date.parse(spring.timeMax) + 1 - Date.parse(spring.timeMin), 23 * 60 * 60 * 1000);

  const autumn = zonedDayBoundsUTC("2026-10-25", "Europe/Belgrade");
  assert.equal(autumn.timeMin, "2026-10-24T22:00:00.000Z");
  assert.equal(autumn.timeMax, "2026-10-25T22:59:59.999Z");
  assert.equal(Date.parse(autumn.timeMax) + 1 - Date.parse(autumn.timeMin), 25 * 60 * 60 * 1000);

  assert.equal(addIsoDays("2026-03-29", 1), "2026-03-30");
  assert.equal(addIsoDays("2026-10-25", -1), "2026-10-24");
});

test("recurring generation is idempotent and respects its start date", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "noema-recurrence-"));
  try {
    const script = `
      import assert from "node:assert/strict";
      const crypto = await import(${JSON.stringify(cryptoUrl)});
      crypto.initCrypto({ legacyPassword: "recurrence-test-key" });
      const todos = await import(${JSON.stringify(todosUrl)});
      todos.replaceTasks([{
        id: "daily-template", title: "Daily after DST", scheduledFor: "2026-03-28",
        priority: "normal", done: false, repeat: "daily", recurrenceTemplateId: "daily-template",
        occurrenceDate: "2026-03-28", subtasks: [], order: 1, createdAt: 1, updatedAt: 1
      }, {
        id: "future-template", title: "Do not start early", scheduledFor: "2026-03-30",
        priority: "normal", done: false, repeat: "daily", recurrenceTemplateId: "future-template",
        occurrenceDate: "2026-03-30", subtasks: [], order: 2, createdAt: 2, updatedAt: 2
      }]);
      const sunday = Date.parse("2026-03-29T10:00:00Z");
      assert.equal(todos.generateRecurring(sunday), 1);
      assert.equal(todos.generateRecurring(sunday), 0);
      let all = todos.listTasks(undefined, { includeDone: true });
      assert.equal(all.filter((item) => item.recurrenceTemplateId === "daily-template" && item.occurrenceDate === "2026-03-29").length, 1);
      assert.equal(all.filter((item) => item.recurrenceTemplateId === "future-template" && item.occurrenceDate === "2026-03-29").length, 0);
      const monday = Date.parse("2026-03-30T10:00:00Z");
      assert.equal(todos.generateRecurring(monday), 2);
      assert.equal(todos.generateRecurring(monday), 0);
      all = todos.listTasks(undefined, { includeDone: true });
      assert.equal(all.filter((item) => item.recurrenceTemplateId === "daily-template" && item.occurrenceDate === "2026-03-30").length, 1);
      assert.equal(all.filter((item) => item.recurrenceTemplateId === "future-template" && item.occurrenceDate === "2026-03-30").length, 1);
      todos.closeStore();
      const db = await import(${JSON.stringify(databaseUrl)});
      db.closeDatabase();
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test", NOEMA_DATA_DIR: path.join(root, "data"), NOEMA_TIMEZONE: "Europe/Belgrade", ENCRYPTION_KEY: "recurrence-test-key" },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
