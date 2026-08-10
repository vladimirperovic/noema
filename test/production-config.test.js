import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configUrl = new URL("../src/config.js", import.meta.url).href;

function load(extra = {}) {
  const env = { ...process.env };
  for (const key of ["UI_PASSWORD", "NOEMA_API_TOKEN", "PUBLIC_BASE_URL", "NOEMA_CORS_ORIGIN", "ALLOW_INSECURE_NO_AUTH", "NOEMA_BACKUP_PASSWORD", "NOEMA_DATA_DIR"]) delete env[key];
  return spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(configUrl)});`], {
    cwd: root,
    encoding: "utf8",
    env: { ...env, NODE_ENV: "production", ...extra },
  });
}

const secure = {
  UI_PASSWORD: "strong-ui-password",
  NOEMA_API_TOKEN: "strong-api-token-0123456789abcdef0123456789abcdef",
  PUBLIC_BASE_URL: "https://noema.example",
  NOEMA_CORS_ORIGIN: "https://noema.example",
  NOEMA_BACKUP_PASSWORD: "long-backup-password",
};

test("production refuses missing authentication and HTTPS", () => {
  const result = load();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UI_PASSWORD is required/);
});

test("production accepts explicit secure settings", () => {
  const result = load(secure);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("new production installations reject weak UI and API credentials", () => {
  const weakUi = load({ ...secure, UI_PASSWORD: "short" });
  assert.notEqual(weakUi.status, 0);
  assert.match(`${weakUi.stdout}${weakUi.stderr}`, /UI_PASSWORD.*14/i);

  const weakApi = load({ ...secure, NOEMA_API_TOKEN: "short-token" });
  assert.notEqual(weakApi.status, 0);
  assert.match(`${weakApi.stdout}${weakApi.stderr}`, /NOEMA_API_TOKEN.*32/i);
});

test("production rejects reusing UI_PASSWORD as the API token", () => {
  const shared = "same-secret-value-that-is-long-enough-0123456789";
  const result = load({ ...secure, UI_PASSWORD: shared, NOEMA_API_TOKEN: shared });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /different from UI_PASSWORD/i);
});

test("development-only insecure override is explicit", () => {
  const result = load({ ALLOW_INSECURE_NO_AUTH: "true" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
