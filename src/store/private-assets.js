import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { copyFile, mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { decryptAssetChunk, encryptAssetChunk } from "./crypto.js";

const MAGIC = Buffer.from("NOEMA-ASSET-V1", "ascii");
const VERSION = 1;
const HEADER_SIZE = 64;
const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const CHUNK_OVERHEAD = 12 + 16;
const ROOT_NAMES = Object.freeze(["uploads", "inspirations", "buildingsites", "link-thumbnails"]);

function assertSafeSize(value) {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("Private asset has an invalid size.");
  return size;
}

function makeHeader(size, chunkSize = DEFAULT_CHUNK_SIZE, assetId = randomBytes(16)) {
  const header = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(header, 0);
  header.writeUInt32LE(VERSION, 16);
  header.writeUInt32LE(chunkSize, 20);
  header.writeBigUInt64LE(BigInt(assertSafeSize(size)), 24);
  assetId.copy(header, 32);
  return header;
}

function parseHeader(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < HEADER_SIZE) return null;
  if (!buffer.subarray(0, MAGIC.length).equals(MAGIC)) return null;
  const version = buffer.readUInt32LE(16);
  const chunkSize = buffer.readUInt32LE(20);
  const sizeBig = buffer.readBigUInt64LE(24);
  if (version !== VERSION || chunkSize < 64 * 1024 || chunkSize > 16 * 1024 * 1024 || sizeBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Private asset header is invalid or unsupported.");
  return { encrypted: true, version, chunkSize, size: Number(sizeBig), assetId: Buffer.from(buffer.subarray(32, 48)) };
}

function chunkAad(info, index) {
  return Buffer.from(`noema:private-asset:v${info.version}:${info.assetId.toString("hex")}:${info.size}:${info.chunkSize}:${index}`, "utf8");
}

async function readExact(handle, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (!bytesRead) break;
    offset += bytesRead;
  }
  if (offset !== length) throw new Error("Private asset is truncated or incomplete.");
  return buffer;
}

async function headerFromHandle(handle) {
  const probe = Buffer.alloc(HEADER_SIZE);
  const { bytesRead } = await handle.read(probe, 0, HEADER_SIZE, 0);
  if (bytesRead < MAGIC.length || !probe.subarray(0, MAGIC.length).equals(MAGIC)) return null;
  if (bytesRead < HEADER_SIZE) throw new Error("Private asset header is incomplete.");
  return parseHeader(probe);
}

async function replaceAtomically(tempPath, targetPath) {
  const backupPath = `${targetPath}.${randomUUID()}.noema-asset-backup`;
  let backedUp = false;
  try {
    if (existsSync(targetPath)) { await rename(targetPath, backupPath); backedUp = true; }
    await rename(tempPath, targetPath);
    if (backedUp) await rm(backupPath, { force: true });
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    if (backedUp && existsSync(backupPath) && !existsSync(targetPath)) await rename(backupPath, targetPath).catch(() => {});
    throw error;
  }
}

async function writeEncryptedChunks({ size, readChunk, targetPath, chunkSize = DEFAULT_CHUNK_SIZE }) {
  const safeSize = assertSafeSize(size);
  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const tempPath = `${targetPath}.${randomUUID()}.noema-asset-tmp`;
  const header = makeHeader(safeSize, chunkSize);
  const info = parseHeader(header);
  const output = await open(tempPath, "wx", 0o600);
  try {
    await output.write(header, 0, header.length, 0);
    let writePosition = HEADER_SIZE;
    let plainPosition = 0;
    let index = 0;
    while (plainPosition < safeSize) {
      const length = Math.min(chunkSize, safeSize - plainPosition);
      const plain = await readChunk(plainPosition, length);
      if (!Buffer.isBuffer(plain) || plain.length !== length) throw new Error("Private asset source was not read completely.");
      const encrypted = encryptAssetChunk(plain, chunkAad(info, index));
      if (encrypted.length !== plain.length + CHUNK_OVERHEAD) throw new Error("Private asset chunk has an unexpected size.");
      await output.write(encrypted, 0, encrypted.length, writePosition);
      writePosition += encrypted.length;
      plainPosition += plain.length;
      index += 1;
    }
    await output.sync();
  } catch (error) {
    await output.close().catch(() => {});
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  await output.close();
  await replaceAtomically(tempPath, targetPath);
  return { size: safeSize, encrypted: true, chunkSize };
}

export async function writePrivateAssetBuffer(targetPath, value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  return writeEncryptedChunks({ size: buffer.length, targetPath, readChunk: async (position, length) => buffer.subarray(position, position + length) });
}

export async function encryptPrivateAssetFile(sourcePath, targetPath) {
  if (path.resolve(sourcePath) === path.resolve(targetPath)) throw new Error("Private asset source and target must be different.");
  const sourceInfo = await stat(sourcePath);
  if (!sourceInfo.isFile()) throw new Error("Private asset source is not a file.");
  const source = await open(sourcePath, "r");
  try { return await writeEncryptedChunks({ size: sourceInfo.size, targetPath, readChunk: async (position, length) => readExact(source, length, position) }); }
  finally { await source.close().catch(() => {}); }
}

export async function privateAssetInfo(filePath) {
  const fileInfo = await stat(filePath);
  if (!fileInfo.isFile()) throw Object.assign(new Error("Private asset is not a file."), { status: 404 });
  if (fileInfo.size < MAGIC.length) return { encrypted: false, size: fileInfo.size, physicalSize: fileInfo.size };
  const handle = await open(filePath, "r");
  try {
    const header = await headerFromHandle(handle);
    return header ? { ...header, physicalSize: fileInfo.size } : { encrypted: false, size: fileInfo.size, physicalSize: fileInfo.size };
  } finally { await handle.close().catch(() => {}); }
}

export async function isPrivateAssetFile(filePath) {
  try { return (await privateAssetInfo(filePath)).encrypted; } catch { return false; }
}

async function forEachPlainChunk(filePath, { start = 0, end = null } = {}, callback) {
  const info = await privateAssetInfo(filePath);
  const size = info.size;
  if (!size) return info;
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = end === null || end === undefined ? size - 1 : Math.min(size - 1, Number(end));
  if (!Number.isSafeInteger(safeStart) || !Number.isSafeInteger(safeEnd) || safeStart < 0 || safeStart >= size || safeEnd < safeStart) throw Object.assign(new Error("Requested byte range is invalid."), { status: 416, size });
  const handle = await open(filePath, "r");
  try {
    if (!info.encrypted) {
      const buffer = Buffer.alloc(Math.min(DEFAULT_CHUNK_SIZE, safeEnd - safeStart + 1));
      let position = safeStart;
      while (position <= safeEnd) {
        const length = Math.min(buffer.length, safeEnd - position + 1);
        const { bytesRead } = await handle.read(buffer, 0, length, position);
        if (!bytesRead) throw new Error("Private asset ended unexpectedly.");
        await callback(Buffer.from(buffer.subarray(0, bytesRead)), position);
        position += bytesRead;
      }
      return info;
    }
    const startChunk = Math.floor(safeStart / info.chunkSize);
    const endChunk = Math.floor(safeEnd / info.chunkSize);
    for (let index = startChunk; index <= endChunk; index += 1) {
      const chunkPlainStart = index * info.chunkSize;
      const plainLength = Math.min(info.chunkSize, size - chunkPlainStart);
      const encryptedLength = plainLength + CHUNK_OVERHEAD;
      const encryptedOffset = HEADER_SIZE + index * (info.chunkSize + CHUNK_OVERHEAD);
      const encrypted = await readExact(handle, encryptedLength, encryptedOffset);
      let plain;
      try { plain = decryptAssetChunk(encrypted, chunkAad(info, index)); } catch { throw new Error("Private asset could not be decrypted or was modified."); }
      if (plain.length !== plainLength) throw new Error("Private asset chunk has an invalid length.");
      const from = index === startChunk ? safeStart - chunkPlainStart : 0;
      const to = index === endChunk ? safeEnd - chunkPlainStart + 1 : plain.length;
      if (to > from) await callback(plain.subarray(from, to), chunkPlainStart + from);
    }
    return info;
  } finally { await handle.close().catch(() => {}); }
}

export async function readPrivateAssetRange(filePath, start = 0, end = null) {
  const chunks = [];
  const info = await forEachPlainChunk(filePath, { start, end }, async (chunk) => { chunks.push(Buffer.from(chunk)); });
  return { info, data: Buffer.concat(chunks) };
}

export async function readPrivateAsset(filePath) {
  const info = await privateAssetInfo(filePath);
  if (!info.size) return Buffer.alloc(0);
  return (await readPrivateAssetRange(filePath, 0, info.size - 1)).data;
}

export async function streamPrivateAsset(filePath, writable, { start = 0, end = null } = {}) {
  return forEachPlainChunk(filePath, { start, end }, async (chunk) => {
    if (writable.destroyed) throw new Error("Client closed the private asset stream.");
    if (!writable.write(chunk)) await once(writable, "drain");
  });
}

export async function decryptPrivateAssetToFile(sourcePath, targetPath) {
  const info = await privateAssetInfo(sourcePath);
  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  if (!info.encrypted) { await copyFile(sourcePath, targetPath); return { size: info.size, encrypted: false }; }
  const tempPath = `${targetPath}.${randomUUID()}.plain-tmp`;
  const output = await open(tempPath, "wx", 0o600);
  let position = 0;
  try {
    if (info.size) await forEachPlainChunk(sourcePath, {}, async (chunk) => { await output.write(chunk, 0, chunk.length, position); position += chunk.length; });
    await output.sync();
  } catch (error) {
    await output.close().catch(() => {});
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  await output.close();
  await replaceAtomically(tempPath, targetPath);
  return { size: info.size, encrypted: true };
}

export async function privateAssetSha256(filePath) {
  const hash = createHash("sha256");
  const info = await privateAssetInfo(filePath);
  if (info.size) await forEachPlainChunk(filePath, {}, async (chunk) => { hash.update(chunk); });
  return hash.digest("hex");
}

async function verifyPrivateAsset(filePath, { full = false } = {}) {
  const info = await privateAssetInfo(filePath);
  if (!info.encrypted) return false;
  if (!info.size) return true;
  if (full) { await forEachPlainChunk(filePath, {}, async () => {}); return true; }
  await readPrivateAssetRange(filePath, 0, Math.min(info.size - 1, 4095));
  if (info.size > 4096) await readPrivateAssetRange(filePath, Math.max(0, info.size - 4096), info.size - 1);
  return true;
}

export async function migratePrivateAssetFile(filePath) {
  const info = await privateAssetInfo(filePath);
  if (info.encrypted) { await verifyPrivateAsset(filePath); return false; }
  const encryptedTemp = `${filePath}.${randomUUID()}.noema-migration`;
  const backupPath = `${filePath}.${randomUUID()}.plaintext-backup`;
  let originalMoved = false;
  try {
    const sourceHash = await privateAssetSha256(filePath);
    await encryptPrivateAssetFile(filePath, encryptedTemp);
    const encryptedInfo = await privateAssetInfo(encryptedTemp);
    if (!encryptedInfo.encrypted || encryptedInfo.size !== info.size) throw new Error("Migrated private asset failed size verification.");
    await verifyPrivateAsset(encryptedTemp, { full: true });
    if (await privateAssetSha256(encryptedTemp) !== sourceHash) throw new Error("Migrated private asset is not byte-for-byte identical to the original.");
    await rename(filePath, backupPath);
    originalMoved = true;
    await rename(encryptedTemp, filePath);
    await verifyPrivateAsset(filePath);
    await rm(backupPath, { force: true });
    return true;
  } catch (error) {
    await rm(encryptedTemp, { force: true }).catch(() => {});
    if (originalMoved && existsSync(backupPath)) { await rm(filePath, { force: true }).catch(() => {}); await rename(backupPath, filePath).catch(() => {}); }
    throw error;
  }
}

function shouldSkipFile(name) {
  return name.includes(".noema-asset-tmp") || name.includes(".noema-asset-backup") || name.includes(".noema-migration") || name.includes(".plaintext-backup") || name.endsWith(".tmp") || name.endsWith(".bak");
}

async function listRegularFiles(root) {
  if (!existsSync(root)) return [];
  const result = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && !shouldSkipFile(entry.name)) result.push(full);
    }
  }
  await walk(root);
  return result;
}

export async function migratePrivateAssetDirectory(root, { quiet = false } = {}) {
  const files = await listRegularFiles(root);
  if (!files.length) return { scanned: 0, migrated: 0 };
  for (const filePath of files) { const info = await privateAssetInfo(filePath); if (info.encrypted) await verifyPrivateAsset(filePath); }
  let migrated = 0;
  for (const filePath of files) {
    if (await migratePrivateAssetFile(filePath)) { migrated += 1; if (!quiet && migrated % 25 === 0) console.log(`[noema] Encrypted ${migrated}/${files.length} private assets…`); }
  }
  if (!quiet && migrated) console.log(`[noema] Encrypted ${migrated} legacy private assets in ${root}.`);
  return { scanned: files.length, migrated };
}

export async function migrateAllPrivateAssets({ quiet = false } = {}) {
  let scanned = 0;
  let migrated = 0;
  for (const name of ROOT_NAMES) {
    const result = await migratePrivateAssetDirectory(path.join(config.DATA_DIR, name), { quiet });
    scanned += result.scanned;
    migrated += result.migrated;
  }
  if (!quiet && scanned) console.log(`[noema] Private asset storage: ${scanned} checked, ${migrated} migrated.`);
  return { scanned, migrated };
}

export function privateAssetRoots() { return ROOT_NAMES.map((name) => path.join(config.DATA_DIR, name)); }
