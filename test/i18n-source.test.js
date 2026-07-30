import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("runtime localization uses Unicode word boundaries and excludes user content", async () => {
  const source = await readFile(path.join(root, "public", "noema-i18n.js"), "utf8");

  assert.ok(source.includes(String.raw`(?<![\\p{L}\\p{N}])`));
  assert.ok(source.includes(String.raw`(?![\\p{L}\\p{N}])`));

  for (const selector of [
    ".task-title",
    ".note-body",
    ".document-content",
    ".link-description",
    ".reader-content",
    ".ProseMirror",
    "textarea:not([readonly])",
  ]) {
    assert.ok(source.includes(JSON.stringify(selector)), "missing protected selector: " + selector);
  }

  assert.match(source, /input\[type="submit"\]/);
});
