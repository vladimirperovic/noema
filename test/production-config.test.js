import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configUrl = new URL("../src/config.js", import.meta.url).href;

function load(extra = {}) {
  const env = { ...process.env };
  for (const key of ["UI_PASSWORD", "NOEMA_API_TOKEN", "PUBLIC_BASE_URL", "NOEMA_CORS_ORIGIN", "ALLOW_INSECURE_NO_AUTH", "NOEMA_BACKUP_PASSWORD"]) delete env[key];
  return spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(configUrl)});`], {
    cwd: root,
    encoding: "utf8",
    env: { ...env, NODE_ENV: "production", ...extra },
  });
}

test("production refuses missing authentication and HTTPS", () => {
  const result = load();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UI_PASSWORD is required/);
});

test("production accepts explicit secure settings", () => {
  const result = load({ UI_PASSWORD: "password", NOEMA_API_TOKEN: "token", PUBLIC_BASE_URL: "https://noema.example", NOEMA_CORS_ORIGIN: "https://noema.example", NOEMA_BACKUP_PASSWORD: "long-backup-password" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("development-only insecure override is explicit", () => {
  const result = load({ ALLOW_INSECURE_NO_AUTH: "true" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
