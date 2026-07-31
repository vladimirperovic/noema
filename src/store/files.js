import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { createCollection } from "./collection.js";

const FILES_DIR = path.join(config.DATA_DIR, "files");
export const MAX_FILE_BYTES = 120 * 1024 * 1024;

function normalizeFile(raw) {
  const file = { ...raw };
  const now = Date.now();
  file.id = String(file.id || "");
  file.name = String(file.name || "Untitled file").trim().slice(0, 240) || "Untitled file";
  file.description = String(file.description || "").trim().slice(0, 8000);
  file.storedName = path.basename(String(file.storedName || ""));
  file.mimeType = String(file.mimeType || "application/octet-stream").slice(0, 160);
  file.size = Number.isFinite(file.size) && file.size >= 0 ? file.size : 0;
  file.createdAt = Number.isFinite(file.createdAt) ? file.createdAt : now;
  file.updatedAt = Number.isFinite(file.updatedAt) ? file.updatedAt : file.createdAt;
  return file;
}

const files = createCollection({
  name: "files",
  legacyFile: "files.json",
  normalize: normalizeFile,
  validate: (file) => Boolean(file?.id && file?.storedName),
});

function decodeBase64(data) {
  if (typeof data !== "string" || !data || !/^[a-zA-Z0-9+/]+={0,2}$/.test(data)) {
    throw Object.assign(new Error("File content must be valid base64."), { status: 400 });
  }
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length) throw Object.assign(new Error("The file is empty."), { status: 400 });
  if (buffer.length > MAX_FILE_BYTES) {
    throw Object.assign(new Error("The file is larger than 120 MB."), { status: 413 });
  }
  return buffer;
}

function extensionFor(name) {
  const extension = path.extname(path.basename(String(name || ""))).toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : ".bin";
}

function storedPath(storedName) {
  const safe = path.basename(String(storedName || ""));
  const full = path.join(FILES_DIR, safe);
  if (!safe || !full.startsWith(`${FILES_DIR}${path.sep}`)) {
    throw Object.assign(new Error("Invalid file path."), { status: 400 });
  }
  return full;
}

function writeAtomically(target, buffer) {
  mkdirSync(FILES_DIR, { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, buffer, { mode: 0o600 });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function loadFiles() {
  mkdirSync(FILES_DIR, { recursive: true, mode: 0o700 });
  return files.load();
}

export function listFiles() {
  return files.list().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getFile(id) {
  return files.get(String(id || ""));
}

export function addFile({ name, description = "", mimeType = "application/octet-stream", data }) {
  const buffer = decodeBase64(data);
  const id = randomUUID();
  const storedName = `${id}${extensionFor(name)}`;
  const target = storedPath(storedName);
  writeAtomically(target, buffer);
  const now = Date.now();
  try {
    return files.set(normalizeFile({
      id,
      name,
      description,
      storedName,
      mimeType,
      size: buffer.length,
      createdAt: now,
      updatedAt: now,
    }));
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  }
}

export function updateFile(id, patch = {}) {
  const current = getFile(id);
  if (!current) return null;
  const next = { ...current };
  if (typeof patch.name === "string") next.name = patch.name;
  if (typeof patch.description === "string") next.description = patch.description;
  next.updatedAt = Date.now();
  return files.set(normalizeFile(next));
}

export function replaceFileContent(id, { name, mimeType, data }) {
  const current = getFile(id);
  if (!current) return null;
  const buffer = decodeBase64(data);
  const nextStoredName = `${current.id}${extensionFor(name || current.name)}`;
  const oldPath = storedPath(current.storedName);
  const nextPath = storedPath(nextStoredName);
  const samePath = nextPath === oldPath;
  const backupPath = samePath && existsSync(oldPath) ? `${oldPath}.${randomUUID()}.bak` : null;

  if (backupPath) renameSync(oldPath, backupPath);
  try {
    writeAtomically(nextPath, buffer);
    const saved = files.set(normalizeFile({
      ...current,
      name: typeof name === "string" && name.trim() ? name : current.name,
      storedName: nextStoredName,
      mimeType: String(mimeType || current.mimeType || "application/octet-stream"),
      size: buffer.length,
      updatedAt: Date.now(),
    }));
    if (!samePath) rmSync(oldPath, { force: true });
    if (backupPath) rmSync(backupPath, { force: true });
    return saved;
  } catch (error) {
    rmSync(nextPath, { force: true });
    if (backupPath && existsSync(backupPath)) renameSync(backupPath, oldPath);
    throw error;
  }
}

export function removeFile(id) {
  const current = getFile(id);
  if (!current) return false;
  const target = storedPath(current.storedName);
  const backupPath = existsSync(target) ? `${target}.${randomUUID()}.delete` : null;
  if (backupPath) renameSync(target, backupPath);
  try {
    const removed = files.remove(current.id);
    if (!removed) {
      if (backupPath && existsSync(backupPath)) renameSync(backupPath, target);
      return false;
    }
    if (backupPath) rmSync(backupPath, { force: true });
    return true;
  } catch (error) {
    if (backupPath && existsSync(backupPath)) renameSync(backupPath, target);
    throw error;
  }
}

export function readFileContent(id) {
  const file = getFile(id);
  if (!file) return null;
  const target = storedPath(file.storedName);
  if (!existsSync(target)) {
    throw Object.assign(new Error("Stored file content was not found."), { status: 404 });
  }
  return { file, data: readFileSync(target) };
}

export function replaceFiles(values) {
  return files.replace(values);
}

export function closeFiles() {
  files.close();
}
