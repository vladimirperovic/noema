import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configUrl = new URL("../src/config.js", import.meta.url).href;

test("NOEMA_DATA_DIR resolves relative to the process working directory", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-data-dir-"));
  try {
    const relative = path.join("state", "noema");
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", `import { config } from ${JSON.stringify(configUrl)}; process.stdout.write(config.DATA_DIR);`],
      {
        cwd,
        encoding: "utf8",
        env: { ...process.env, NOEMA_DATA_DIR: relative },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, path.resolve(cwd, relative));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
