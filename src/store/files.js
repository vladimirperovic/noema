import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { createCollection } from "./collection.js";
import { decryptBuffer, encryptBuffer, isEncryptedBuffer } from "./crypto.js";

const FILES_DIR = path.join(config.DATA_DIR, "files");
export const MAX_FILE_BYTES = 120 * 1024 * 1024;
const ENVELOPE_PROBE_BYTES = 64;
const CHUNKED_ASSET_MAGIC = Buffer.from("NOEMA-ASSET-V1", "ascii");

function normalizeFolder(raw) {
  const now = Date.now();
  return { ...raw, id: String(raw?.id || ""), name: String(raw?.name || "Untitled folder").trim().slice(0, 100) || "Untitled folder", createdAt: Number.isFinite(raw?.createdAt) ? raw.createdAt : now, updatedAt: Number.isFinite(raw?.updatedAt) ? raw.updatedAt : Number.isFinite(raw?.createdAt) ? raw.createdAt : now };
}

function normalizeFile(raw) {
  const file = { ...raw };
  const now = Date.now();
  file.id = String(file.id || "");
  file.name = String(file.name || "Untitled file").trim().slice(0, 240) || "Untitled file";
  file.description = String(file.description || "").trim().slice(0, 8000);
  file.folderId = typeof file.folderId === "string" ? file.folderId : "";
  file.storedName = path.basename(String(file.storedName || ""));
  file.mimeType = String(file.mimeType || "application/octet-stream").slice(0, 160);
  file.size = Number.isFinite(file.size) && file.size >= 0 ? file.size : 0;
  file.createdAt = Number.isFinite(file.createdAt) ? file.createdAt : now;
  file.updatedAt = Number.isFinite(file.updatedAt) ? file.updatedAt : file.createdAt;
  if (!Number.isFinite(file.encryptedAt)) delete file.encryptedAt;
  if (file.assetFormat !== "private-asset-v1") delete file.assetFormat;
  return file;
}

const fileFolders = createCollection({ name: "file-folders", legacyFile: "file-folders.json", normalize: normalizeFolder, validate: (folder) => Boolean(folder && typeof folder.id === "string" && folder.id && typeof folder.name === "string" && folder.name) });
const files = createCollection({ name: "files", legacyFile: "files.json", normalize: normalizeFile, validate: (file) => Boolean(file && typeof file.id === "string" && file.id && typeof file.storedName === "string" && file.storedName) });

function decodeBase64(data) {
  if (typeof data !== "string" || !data || !/^[a-zA-Z0-9+/]+={0,2}$/.test(data)) throw Object.assign(new Error("File content is not valid base64."), { status: 400 });
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length) throw Object.assign(new Error("File is empty."), { status: 400 });
  if (buffer.length > MAX_FILE_BYTES) throw Object.assign(new Error("File is larger than 120 MB."), { status: 413 });
  return buffer;
}

function extensionFor(name) { const extension = path.extname(path.basename(String(name || ""))).toLowerCase(); return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : ".bin"; }
function storedPath(storedName) { const safe = path.basename(String(storedName || "")); const full = path.join(FILES_DIR, safe); if (!safe || !full.startsWith(FILES_DIR + path.sep)) throw Object.assign(new Error("Invalid file path."), { status: 400 }); return full; }
function writeAtomically(target, buffer) { mkdirSync(FILES_DIR, { recursive: true, mode: 0o700 }); const temporary = `${target}.${randomUUID()}.tmp`; try { writeFileSync(temporary, buffer, { mode: 0o600 }); renameSync(temporary, target); } finally { rmSync(temporary, { force: true }); } }
function fileAad(id) { return `noema:file:${String(id || "")}`; }
function isChunkedPrivateAsset(raw) { return Buffer.isBuffer(raw) && raw.length >= CHUNKED_ASSET_MAGIC.length && raw.subarray(0, CHUNKED_ASSET_MAGIC.length).equals(CHUNKED_ASSET_MAGIC); }
function readEnvelopeProbe(filePath) { const fd = openSync(filePath, "r"); try { const buffer = Buffer.alloc(ENVELOPE_PROBE_BYTES); const bytesRead = readSync(fd, buffer, 0, buffer.length, 0); return buffer.subarray(0, bytesRead); } finally { closeSync(fd); } }
function envelopeType(filePath) { const probe = readEnvelopeProbe(filePath); if (isChunkedPrivateAsset(probe)) return "chunked"; if (isEncryptedBuffer(probe)) return "legacy-encrypted"; return "plaintext"; }
function folderExists(id) { return !id || Boolean(fileFolders.get(String(id))); }
function requireFolder(id) { const folderId = typeof id === "string" ? id : ""; if (!folderExists(folderId)) throw Object.assign(new Error("Folder not found."), { status: 400 }); return folderId; }
function sameFolderName(name, excludeId = "") { const key = String(name || "").trim().toLocaleLowerCase(); return fileFolders.list().some((folder) => folder.id !== excludeId && folder.name.toLocaleLowerCase() === key); }

function migratePlaintextFiles() {
  let migrated = 0;
  for (const file of files.list()) {
    const target = storedPath(file.storedName);
    if (!existsSync(target)) continue;
    const envelope = envelopeType(target);
    if (envelope === "chunked") {
      if (file.assetFormat !== "private-asset-v1") files.set(normalizeFile({ ...file, assetFormat: "private-asset-v1", encryptedAt: file.encryptedAt || Date.now() }));
      continue;
    }
    if (envelope === "legacy-encrypted") continue;
    const raw = readFileSync(target);
    writeAtomically(target, encryptBuffer(raw, fileAad(file.id)));
    files.set(normalizeFile({ ...file, encryptedAt: Date.now() }));
    migrated += 1;
  }
  if (migrated) console.log(`[noema] Encrypted ${migrated} existing files in data/files.`);
  return migrated;
}

export function loadFiles() {
  mkdirSync(FILES_DIR, { recursive: true, mode: 0o700 });
  fileFolders.load();
  const loaded = files.load();
  let repaired = false;
  const normalized = loaded.map((file) => { if (folderExists(file.folderId)) return file; repaired = true; return { ...file, folderId: "", updatedAt: Date.now() }; });
  if (repaired) files.replace(normalized);
  migratePlaintextFiles();
  return files.list();
}

export function listFiles() { return files.list().sort((a, b) => b.updatedAt - a.updatedAt); }
export function getFile(id) { return files.get(String(id || "")); }
export function listFileFolders() { return fileFolders.list().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })); }
export function getFileFolder(id) { return fileFolders.get(String(id || "")); }
export function addFileFolder({ name }) { const normalizedName = String(name || "").trim().slice(0, 100); if (!normalizedName) throw Object.assign(new Error("Enter a folder name."), { status: 400 }); if (sameFolderName(normalizedName)) throw Object.assign(new Error("A folder with that name already exists."), { status: 409 }); const now = Date.now(); return fileFolders.set(normalizeFolder({ id: randomUUID(), name: normalizedName, createdAt: now, updatedAt: now })); }
export function updateFileFolder(id, { name }) { const current = getFileFolder(id); if (!current) return null; const normalizedName = String(name || "").trim().slice(0, 100); if (!normalizedName) throw Object.assign(new Error("Enter a folder name."), { status: 400 }); if (sameFolderName(normalizedName, current.id)) throw Object.assign(new Error("A folder with that name already exists."), { status: 409 }); return fileFolders.set(normalizeFolder({ ...current, name: normalizedName, updatedAt: Date.now() })); }
export function removeFileFolder(id) { const current = getFileFolder(id); if (!current) return null; let moved = 0; const nextFiles = files.list().map((file) => { if (file.folderId !== current.id) return file; moved += 1; return normalizeFile({ ...file, folderId: "", updatedAt: Date.now() }); }); if (moved) files.replace(nextFiles); if (!fileFolders.remove(current.id)) return null; return { folder: current, moved }; }

export function addFile({ name, description = "", folderId = "", mimeType = "application/octet-stream", data }) {
  const buffer = decodeBase64(data); const id = randomUUID(); const storedName = `${id}${extensionFor(name)}`; const target = storedPath(storedName); const safeFolderId = requireFolder(folderId); writeAtomically(target, encryptBuffer(buffer, fileAad(id))); const now = Date.now();
  try { return files.set(normalizeFile({ id, name, description, folderId: safeFolderId, storedName, mimeType, size: buffer.length, encryptedAt: now, createdAt: now, updatedAt: now })); }
  catch (error) { rmSync(target, { force: true }); throw error; }
}

export function registerStreamedFile({ id, name, description = "", folderId = "", storedName, mimeType = "application/octet-stream", size }) { const now = Date.now(); return files.set(normalizeFile({ id, name, description, folderId: requireFolder(folderId), storedName, mimeType, size, assetFormat: "private-asset-v1", encryptedAt: now, createdAt: now, updatedAt: now })); }
export function registerStreamedReplacement(id, { name, storedName, mimeType, size }) { const current = getFile(id); if (!current) return null; return files.set(normalizeFile({ ...current, name: typeof name === "string" && name.trim() ? name : current.name, storedName, mimeType: String(mimeType || current.mimeType || "application/octet-stream"), size, assetFormat: "private-asset-v1", encryptedAt: Date.now(), updatedAt: Date.now() })); }
export function fileStoragePath(storedName) { return storedPath(storedName); }
export function streamedStoredName(id, name) { return `${String(id)}${extensionFor(name)}`; }
export function updateFile(id, patch) { const current = getFile(id); if (!current) return null; const next = { ...current }; if (typeof patch.name === "string") next.name = patch.name; if (typeof patch.description === "string") next.description = patch.description; if (Object.hasOwn(patch, "folderId")) next.folderId = requireFolder(patch.folderId); next.updatedAt = Date.now(); return files.set(normalizeFile(next)); }

export function replaceFileContent(id, { name, mimeType, data }) {
  const current = getFile(id); if (!current) return null; const buffer = decodeBase64(data); const nextStoredName = `${current.id}${extensionFor(name || current.name)}`; const oldPath = storedPath(current.storedName); const nextPath = storedPath(nextStoredName); const samePath = nextPath === oldPath; const backupPath = samePath && existsSync(oldPath) ? `${oldPath}.${randomUUID()}.bak` : null;
  if (backupPath) renameSync(oldPath, backupPath);
  try { writeAtomically(nextPath, encryptBuffer(buffer, fileAad(current.id))); const next = normalizeFile({ ...current, name: typeof name === "string" && name.trim() ? name : current.name, storedName: nextStoredName, mimeType: String(mimeType || current.mimeType || "application/octet-stream"), size: buffer.length, encryptedAt: Date.now(), updatedAt: Date.now() }); delete next.assetFormat; const saved = files.set(next); if (!samePath) rmSync(oldPath, { force: true }); if (backupPath) rmSync(backupPath, { force: true }); return saved; }
  catch (error) { rmSync(nextPath, { force: true }); if (backupPath && existsSync(backupPath)) renameSync(backupPath, oldPath); throw error; }
}

export function removeFile(id) { const current = getFile(id); if (!current) return false; const target = storedPath(current.storedName); const backup = existsSync(target) ? `${target}.${randomUUID()}.delete` : null; if (backup) renameSync(target, backup); try { const removed = files.remove(current.id); if (!removed) { if (backup && existsSync(backup)) renameSync(backup, target); return false; } if (backup) rmSync(backup, { force: true }); return true; } catch (error) { if (backup && existsSync(backup)) renameSync(backup, target); throw error; } }

export function readFileContent(id) {
  const file = getFile(id); if (!file) return null; const target = storedPath(file.storedName); if (!existsSync(target)) throw Object.assign(new Error("File content was not found."), { status: 404 });
  if (file.assetFormat === "private-asset-v1" || envelopeType(target) === "chunked") { if (file.assetFormat !== "private-asset-v1") files.set(normalizeFile({ ...file, assetFormat: "private-asset-v1", encryptedAt: file.encryptedAt || Date.now() })); throw Object.assign(new Error("Chunked file must be served through the streaming route."), { status: 409, streaming: true }); }
  const raw = readFileSync(target);
  if (!isEncryptedBuffer(raw)) { const encrypted = encryptBuffer(raw, fileAad(file.id)); writeAtomically(target, encrypted); files.set(normalizeFile({ ...file, encryptedAt: Date.now() })); return { file: getFile(file.id), data: raw }; }
  try { return { file, data: decryptBuffer(raw, fileAad(file.id)) }; } catch { throw Object.assign(new Error("File could not be decrypted or was modified."), { status: 500 }); }
}

export function replaceFiles(values) { const next = files.replace(values); migratePlaintextFiles(); return next; }
export function closeFiles() { files.close(); fileFolders.close(); }
