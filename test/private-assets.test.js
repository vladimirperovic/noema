import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "noema-private-assets-"));
process.env.NODE_ENV = "test";
process.env.ALLOW_INSECURE_NO_AUTH = "true";
process.env.NOEMA_DATA_DIR = path.join(root, "data");
process.env.UI_PASSWORD = "";
process.env.ENCRYPTION_KEY = "private-assets-test-key";

const { config } = await import("../src/config.js");
const { initCrypto } = await import("../src/store/crypto.js");
const {
  migratePrivateAssetFile,
  privateAssetInfo,
  privateAssetSha256,
  readPrivateAsset,
  readPrivateAssetRange,
  writePrivateAssetBuffer,
} = await import("../src/store/private-assets.js");

initCrypto({ masterPassword: "", legacyPassword: config.ENCRYPTION_KEY });

function patternedBuffer(size) {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) buffer[i] = (i * 31 + 17) & 0xff;
  return buffer;
}

test("private assets are ciphertext on disk and byte-identical after decryption", async () => {
  const original = patternedBuffer(2 * 1024 * 1024 + 1777);
  const filePath = path.join(config.DATA_DIR, "uploads", "large-private.bin");
  await writePrivateAssetBuffer(filePath, original);
  const stored = await readFile(filePath);
  assert.equal(stored.subarray(0, 14).toString("ascii"), "NOEMA-ASSET-V1");
  assert.equal(stored.equals(original), false);
  assert.equal(stored.includes(original.subarray(0, 4096)), false);
  const info = await privateAssetInfo(filePath);
  assert.equal(info.encrypted, true);
  assert.equal(info.size, original.length);
  assert.deepEqual(await readPrivateAsset(filePath), original);
  const start = 1_040_000;
  const end = 1_090_123;
  assert.deepEqual((await readPrivateAssetRange(filePath, start, end)).data, original.subarray(start, end + 1));
});

test("legacy plaintext private assets migrate only after full verification", async () => {
  const original = Buffer.from("legacy private data that must disappear from persistent storage");
  const filePath = path.join(config.DATA_DIR, "uploads", "legacy-private.txt");
  await writeFile(filePath, original, { mode: 0o600 });
  assert.equal((await privateAssetInfo(filePath)).encrypted, false);
  assert.equal(await migratePrivateAssetFile(filePath), true);
  assert.equal((await privateAssetInfo(filePath)).encrypted, true);
  const stored = await readFile(filePath);
  assert.equal(stored.includes(original), false);
  assert.deepEqual(await readPrivateAsset(filePath), original);
  assert.equal(await migratePrivateAssetFile(filePath), false);
});

test("private asset SHA-256 represents plaintext rather than ciphertext", async () => {
  const original = patternedBuffer(300_123);
  const encryptedPath = path.join(config.DATA_DIR, "link-thumbnails", "hash-test.png");
  const plainPath = path.join(root, "plain-hash-source.bin");
  await writePrivateAssetBuffer(encryptedPath, original);
  await writeFile(plainPath, original);
  assert.equal(await privateAssetSha256(encryptedPath), await privateAssetSha256(plainPath));
});

test.after(async () => {
  await rm(root, { recursive: true, force: true });
});
