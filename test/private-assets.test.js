import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

const root = await mkdtemp(path.join(os.tmpdir(), "noema-private-assets-"));
process.env.NODE_ENV = "test";
process.env.ALLOW_INSECURE_NO_AUTH = "true";
process.env.NOEMA_DATA_DIR = path.join(root, "data");
process.env.UI_PASSWORD = "";
process.env.ENCRYPTION_KEY = "private-assets-test-key";

const { config } = await import("../src/config.js");
const { encryptBuffer, initCrypto } = await import("../src/store/crypto.js");
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

function legacyAssetContainer(original, chunkSize = 1024 * 1024) {
  const version = 1;
  const assetId = randomBytes(16);
  const header = Buffer.alloc(64);
  Buffer.from("NOEMA-ASSET-V1", "ascii").copy(header, 0);
  header.writeUInt32LE(version, 16);
  header.writeUInt32LE(chunkSize, 20);
  header.writeBigUInt64LE(BigInt(original.length), 24);
  assetId.copy(header, 32);
  const chunks = [header];
  for (let index = 0, offset = 0; offset < original.length; index += 1, offset += chunkSize) {
    const plain = original.subarray(offset, Math.min(original.length, offset + chunkSize));
    const aad = `noema:private-asset:v${version}:${assetId.toString("hex")}:${original.length}:${chunkSize}:${index}`;
    chunks.push(encryptBuffer(plain, aad));
  }
  return Buffer.concat(chunks);
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

test("legacy 42-byte chunk containers remain readable after the compact chunk upgrade", async () => {
  const original = patternedBuffer(2 * 1024 * 1024 + 321);
  const filePath = path.join(config.DATA_DIR, "uploads", "legacy-chunked.bin");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, legacyAssetContainer(original), { mode: 0o600 });
  const info = await privateAssetInfo(filePath);
  assert.equal(info.encrypted, true);
  assert.equal(info.size, original.length);
  assert.deepEqual(await readPrivateAsset(filePath), original);
  assert.deepEqual((await readPrivateAssetRange(filePath, 900_000, 1_200_000)).data, original.subarray(900_000, 1_200_001));
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
