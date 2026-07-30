import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
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

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error("Server exited with " + child.exitCode);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server did not become healthy");
}

test("OAuth initiation is protected, English UI assets are public, and snapshots cover all metadata modules", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-audit-"));
  const port = await freePort();
  const base = "http://127.0.0.1:" + port;
  const token = "test-api-token";
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
      NOEMA_CORS_ORIGIN: base,
      NOEMA_API_TOKEN: token,
      UI_PASSWORD: "test-password",
      ENCRYPTION_KEY: "test-encryption-key",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
    },
  });

  try {
    await waitFor(base + "/healthz", child);

    const oauth = await fetch(base + "/auth/google", { redirect: "manual", headers: { Accept: "text/html" } });
    assert.equal(oauth.status, 302);
    assert.match(oauth.headers.get("location"), /^/login?next=/);

    const callback = await fetch(base + "/auth/google/callback?error=access_denied", { redirect: "manual" });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "/?calendar=denied");

    const i18n = await fetch(base + "/noema-i18n.js");
    assert.equal(i18n.status, 200);
    assert.match(await i18n.text(), /USER_CONTENT_SELECTOR/);

    const home = await fetch(base + "/", { headers: { Authorization: "Bearer " + token } });
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<html[^>]*lang="en"/i);
    assert.match(html, /<script src="/noema-i18n.js"></script>/);

    const authHeaders = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
    const snapshotResponse = await fetch(base + "/api/backup/snapshot", { method: "POST", headers: authHeaders, body: "{}" });
    assert.equal(snapshotResponse.status, 200);
    const { filename } = await snapshotResponse.json();
    const snapshotPath = path.join(cwd, "data", "snapshots", filename);
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    assert.equal(snapshot.scope, "metadata");
    assert.equal(snapshot.includesMedia, false);
    assert.ok(Array.isArray(snapshot.data.buildingSites));
    assert.ok(Array.isArray(snapshot.data.inspirations));

    snapshot.data.buildingSites = [{ id: "site-1", title: "Test site", images: [], createdAt: 1, updatedAt: 1 }];
    snapshot.data.inspirations = [{ id: "inspiration-1", title: "Test inspiration", images: [], createdAt: 1, updatedAt: 1 }];
    await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

    const restore = await fetch(base + "/api/backup/restore-snapshot", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ filename }),
    });
    assert.equal(restore.status, 200);
    const restored = (await restore.json()).restored;
    assert.equal(restored.buildingSites, 1);
    assert.equal(restored.inspirations, 1);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(cwd, { recursive: true, force: true });
  }
});
