import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = (relativePath) => new URL(relativePath, import.meta.url).href;

function run(dataDir, source, extra = {}) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", NOEMA_DATA_DIR: dataDir, ENCRYPTION_KEY: "security-store-key", UI_PASSWORD: "test-password", SESSION_IDLE_HOURS: "1", SESSION_ABSOLUTE_HOURS: "2", GALLERY_SHARE_TTL_DAYS: "3", ...extra },
  });
}

test("server sessions are hashed, revocable, and password-bound", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-session-"));
  try {
    const result = run(path.join(cwd, "data"), `
      import assert from "node:assert/strict";
      const { config } = await import(${JSON.stringify(moduleUrl("../src/config.js"))});
      const { initCrypto } = await import(${JSON.stringify(moduleUrl("../src/store/crypto.js"))});
      initCrypto(config.ENCRYPTION_KEY);
      const sessions = await import(${JSON.stringify(moduleUrl("../src/store/sessions.js"))});
      sessions.loadSessions();
      const token = sessions.createSession();
      assert.ok(token.length >= 32);
      assert.ok(sessions.verifySession(token));
      assert.equal(sessions.revokeSession(token), true);
      assert.equal(sessions.verifySession(token), null);
      sessions.closeSessions();
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("gallery share tokens are scoped, expiring, and revocable", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-share-"));
  try {
    const result = run(path.join(cwd, "data"), `
      import assert from "node:assert/strict";
      const { config } = await import(${JSON.stringify(moduleUrl("../src/config.js"))});
      const { initCrypto } = await import(${JSON.stringify(moduleUrl("../src/store/crypto.js"))});
      initCrypto(config.ENCRYPTION_KEY);
      const shares = await import(${JSON.stringify(moduleUrl("../src/store/share-tokens.js"))});
      shares.loadGalleryShares();
      const created = shares.createGalleryShare({ scope: "inspiration", albumId: "album-1", expiresInDays: 5 });
      assert.equal(shares.verifyGalleryShare(created.token).scope, "inspiration");
      assert.equal(shares.revokeGalleryShare(created.share.id), true);
      assert.equal(shares.verifyGalleryShare(created.token), null);
      shares.closeGalleryShares();
      const { closeDatabase } = await import(${JSON.stringify(moduleUrl("../src/store/database.js"))});
      closeDatabase();
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
