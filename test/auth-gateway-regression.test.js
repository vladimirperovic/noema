import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

test("private API uses password-only form login without a Basic-auth browser challenge", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "noema-auth-regression-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      PUBLIC_BASE_URL: `https://noema.test:${port}`,
      NOEMA_CORS_ORIGIN: `https://noema.test:${port}`,
      UI_PASSWORD: "server-test-password",
      NOEMA_API_TOKEN: "server-test-api-token-0123456789abcdef0123456789abcdef",
      ENCRYPTION_KEY: "",
      NOEMA_BACKUP_PASSWORD: "server-test-backup-password",
      NOEMA_DATA_DIR: path.join(root, "data"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}/healthz`);
        if (response.ok) { ready = true; break; }
      } catch {}
      if (!child.pid || child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, `server failed to start:\n${output}`);

    const unauthorized = await fetch(`${baseUrl}/api/todos`, {
      headers: { Accept: "application/json" },
      redirect: "manual",
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get("www-authenticate"), null);
    assert.match(unauthorized.headers.get("cache-control") || "", /no-store/i);

    const htmlUnauthorized = await fetch(`${baseUrl}/documents`, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    assert.equal(htmlUnauthorized.status, 302);
    assert.match(htmlUnauthorized.headers.get("location") || "", /^\/login\?next=/);

    const basic = Buffer.from("ignored:server-test-password").toString("base64");
    const legacyBasic = await fetch(`${baseUrl}/api/todos`, {
      headers: { Accept: "application/json", Authorization: `Basic ${basic}` },
      redirect: "manual",
    });
    assert.equal(legacyBasic.status, 401);
    assert.equal(legacyBasic.headers.get("www-authenticate"), null);

    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ password: "server-test-password" }),
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    assert.match(cookie, /^noema_session=/);

    const authorized = await fetch(`${baseUrl}/api/todos`, {
      headers: { Cookie: cookie, Accept: "application/json" },
    });
    assert.equal(authorized.status, 200);
    assert.match(authorized.headers.get("cache-control") || "", /no-store/i);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy browser auth is absent from the inner server", async () => {
  const source = await readFile(path.join(repoRoot, "src", "server.js"), "utf8");
  for (const forbidden of [
    "WWW-Authenticate",
    "checkUiPassword",
    "createSessionToken",
    "verifySessionToken",
    "MAX_FAILED_LOGIN_ATTEMPTS",
    "ipRequestCounts",
    "galleryShareToken",
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("service worker caches only explicit static shell assets", async () => {
  const source = await readFile(path.join(repoRoot, "public", "sw.js"), "utf8");
  assert.match(source, /CACHEABLE_PATHS/);
  assert.match(source, /isSensitivePath/);
  assert.match(source, /url\.search === ""/);
  assert.match(source, /Sensitive\/private and non-shell requests are strictly network-only/);
  for (const forbidden of ["/api/", "/uploads/", "/buildingsite-files/", "/inspiration-files/", "/thumbnails/", "/private-assets/"]) {
    assert.match(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /ASSETS\s*=\s*\[[\s\S]*["']\/backup\.html["']/);
  assert.doesNotMatch(source, /ASSETS\s*=\s*\[[\s\S]*["']\/buildingsite\.html["']/);
  assert.doesNotMatch(source, /ASSETS\s*=\s*\[[\s\S]*["']\/inspiration\.html["']/);
});
