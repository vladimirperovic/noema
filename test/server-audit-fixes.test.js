import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "src", "index.js");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitFor(url, child, logs) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error("Server exited with " + child.exitCode + ":\n" + logs());
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server did not become healthy:\n" + logs());
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

test("OAuth is protected, browser sessions own backup authority, and encrypted backups cover all metadata modules", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-audit-"));
  const port = await freePort();
  const base = "http://127.0.0.1:" + port;
  const token = "test-api-token";
  let output = "";
  const child = spawn(process.execPath, [entry], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      PUBLIC_BASE_URL: base,
      NODE_ENV: "test",
      NOEMA_TIMEZONE: "UTC",
      NOEMA_DATA_DIR: path.join(cwd, "data"),
      NOEMA_CORS_ORIGIN: base,
      NOEMA_API_TOKEN: token,
      UI_PASSWORD: "test-password",
      ENCRYPTION_KEY: "test-encryption-key",
      NOEMA_BACKUP_PASSWORD: "test-backup-password",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
    },
  });
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  try {
    await waitFor(base + "/healthz", child, () => output);

    const oauth = await fetch(base + "/auth/google", { redirect: "manual", headers: { Accept: "text/html" } });
    assert.equal(oauth.status, 302);
    assert.match(oauth.headers.get("location"), /^\/login\?next=/);

    const callback = await fetch(base + "/auth/google/callback?error=access_denied", { redirect: "manual" });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "/?calendar=denied");

    const i18n = await fetch(base + "/noema-i18n.js");
    assert.equal(i18n.status, 200);
    const i18nSource = await i18n.text();
    assert.match(i18nSource, /USER_CONTENT_SELECTOR/);
    assert.ok(i18nSource.includes("(?<![\\\\p{L}\\\\p{N}])"));

    const auth = { Authorization: "Bearer " + token };
    const home = await fetch(base + "/", { headers: auth });
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<html[^>]*lang="en"/i);
    assert.match(html, /<script src="\/noema-i18n\.js"><\/script>/);

    const missing = await fetch(base + "/this-page-does-not-exist", { headers: { ...auth, Accept: "text/html" } });
    assert.equal(missing.status, 404);
    const missingHtml = await missing.text();
    assert.match(missingHtml, /<html[^>]*lang="en"/i);
    assert.match(missingHtml, /<script src="\/noema-i18n\.js"><\/script>/);

    // A machine bearer token may use normal API routes, but full private backup
    // operations require an authenticated administrator browser session.
    const bearerBackup = await fetch(base + "/api/backup/download-json", { headers: auth });
    assert.equal(bearerBackup.status, 403);

    const login = await fetch(base + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ password: "test-password" }),
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    assert.match(cookie, /^noema_session=/);
    const admin = { Cookie: cookie };
    const adminJson = { ...admin, "Content-Type": "application/json" };

    const snapshotResponse = await fetch(base + "/api/backup/snapshot", { method: "POST", headers: adminJson, body: "{}" });
    assert.equal(snapshotResponse.status, 200);
    const { filename } = await snapshotResponse.json();
    assert.match(filename, /^snapshot_\d+\.enc$/);
    const snapshotPath = path.join(cwd, "data", "snapshots", filename);
    const encrypted = await readFile(snapshotPath);
    assert.ok(encrypted.length > 32);
    assert.ok(!encrypted.toString("utf8").includes("buildingSites"));

    const download = await fetch(base + "/api/backup/download-json", { headers: admin });
    assert.equal(download.status, 200);
    const portable = await download.json();
    assert.equal(portable.scope, "metadata");
    assert.equal(portable.includesMedia, false);
    assert.ok(Array.isArray(portable.data.files));
    assert.ok(Array.isArray(portable.data.buildingSites));
    assert.ok(Array.isArray(portable.data.inspirations));

    portable.data.buildingSites = [{ id: "site-1", title: "Test site", images: [], createdAt: 1, updatedAt: 1 }];
    portable.data.inspirations = [{ id: "inspiration-1", title: "Test inspiration", images: [], createdAt: 1, updatedAt: 1 }];
    portable.data.files = [];
    const upload = await fetch(base + "/api/backup/upload", { method: "POST", headers: adminJson, body: JSON.stringify(portable) });
    assert.equal(upload.status, 200);
    const restored = (await upload.json()).restored;
    assert.equal(restored.files, 0);
    assert.equal(restored.buildingSites, 1);
    assert.equal(restored.inspirations, 1);

    const restoreSnapshot = await fetch(base + "/api/backup/restore-snapshot", { method: "POST", headers: adminJson, body: JSON.stringify({ filename }) });
    assert.equal(restoreSnapshot.status, 200);
  } finally {
    await stopChild(child);
    await rm(cwd, { recursive: true, force: true });
  }
});
