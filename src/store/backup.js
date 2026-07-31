import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "../config.js";
import { flushCollectionMirrors } from "./collection.js";
import { checkpointDatabase } from "./database.js";

const MAGIC = Buffer.from("NOEMA-BACKUP-1\n", "utf8");
const EXCLUDED = new Set(["noema.sqlite-shm"]);

function requirePassword(password = config.NOEMA_BACKUP_PASSWORD) {
  const value = String(password || "");
  if (value.length < 12) throw Object.assign(new Error("NOEMA_BACKUP_PASSWORD must contain at least 12 characters."), { status: 503 });
  return value;
}

function walk(root, relative = "") {
  const current = path.join(root, relative);
  const entries = readdirSync(current, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (EXCLUDED.has(entry.name) || entry.name.endsWith(".tmp") || entry.name.includes("noema_archive_")) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...walk(root, next));
    else if (entry.isFile()) result.push(next);
  }
  return result.sort();
}

function manifestFor(dataRoot) {
  const files = walk(dataRoot);
  return {
    format: "noema-disaster-recovery-v1",
    createdAt: new Date().toISOString(),
    files: files.map((relative) => {
      const data = readFileSync(path.join(dataRoot, relative));
      return { path: relative.split(path.sep).join("/"), size: data.length, sha256: createHash("sha256").update(data).digest("hex") };
    }),
  };
}

function verifyManifest(dataRoot, manifest) {
  if (!manifest || manifest.format !== "noema-disaster-recovery-v1" || !Array.isArray(manifest.files)) throw new Error("The backup manifest is invalid.");
  for (const entry of manifest.files) {
    const relative = String(entry.path || "").replace(/\//g, path.sep);
    const full = path.resolve(dataRoot, relative);
    if (!full.startsWith(path.resolve(dataRoot) + path.sep) || !existsSync(full)) throw new Error(`Backup file is missing: ${entry.path}`);
    const data = readFileSync(full);
    if (data.length !== entry.size || createHash("sha256").update(data).digest("hex") !== entry.sha256) throw new Error(`Backup checksum failed: ${entry.path}`);
  }
}

function encrypt(zip, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(requirePassword(password), salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(zip), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
}

function decrypt(archive, password) {
  const data = Buffer.isBuffer(archive) ? archive : Buffer.from(archive);
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("This is not a Noema encrypted archive.");
  let offset = MAGIC.length;
  const salt = data.subarray(offset, offset += 16);
  const iv = data.subarray(offset, offset += 12);
  const tag = data.subarray(offset, offset += 16);
  const key = scryptSync(requirePassword(password), salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(data.subarray(offset)), decipher.final()]); }
  catch { throw new Error("The backup password is incorrect or the archive is damaged."); }
}

export function createEncryptedBackup(password) {
  flushCollectionMirrors();
  checkpointDatabase();
  mkdirSync(config.DATA_DIR, { recursive: true, mode: 0o700 });
  const temporary = mkdtempSync(path.join(tmpdir(), "noema-backup-"));
  try {
    const payload = path.join(temporary, "payload");
    const dataCopy = path.join(payload, "data");
    mkdirSync(payload, { recursive: true });
    cpSync(config.DATA_DIR, dataCopy, { recursive: true, force: true, filter: (source) => !EXCLUDED.has(path.basename(source)) && !path.basename(source).endsWith(".tmp") && !path.basename(source).includes("noema_archive_") });
    writeFileSync(path.join(payload, "manifest.json"), JSON.stringify(manifestFor(dataCopy), null, 2), { mode: 0o600 });
    const zipPath = path.join(temporary, "payload.zip");
    execFileSync("zip", ["-q", "-r", zipPath, "data", "manifest.json"], { cwd: payload });
    return encrypt(readFileSync(zipPath), password);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function inspectEncryptedBackup(archive, password) {
  const temporary = mkdtempSync(path.join(tmpdir(), "noema-inspect-"));
  try {
    const zipPath = path.join(temporary, "payload.zip");
    writeFileSync(zipPath, decrypt(archive, password), { mode: 0o600 });
    execFileSync("unzip", ["-q", zipPath, "-d", temporary]);
    const dataRoot = path.join(temporary, "data");
    const manifest = JSON.parse(readFileSync(path.join(temporary, "manifest.json"), "utf8"));
    verifyManifest(dataRoot, manifest);
    return manifest;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function restoreEncryptedBackup(archive, password, targetDir = config.DATA_DIR) {
  const target = path.resolve(targetDir);
  if (target === path.parse(target).root) throw new Error("Refusing to restore into a filesystem root.");
  const temporary = mkdtempSync(path.join(tmpdir(), "noema-restore-"));
  try {
    const zipPath = path.join(temporary, "payload.zip");
    writeFileSync(zipPath, decrypt(archive, password), { mode: 0o600 });
    execFileSync("unzip", ["-q", zipPath, "-d", temporary]);
    const restoredData = path.join(temporary, "data");
    const manifest = JSON.parse(readFileSync(path.join(temporary, "manifest.json"), "utf8"));
    verifyManifest(restoredData, manifest);
    const previous = `${target}.before-${Date.now()}`;
    if (existsSync(target)) renameSync(target, previous);
    try {
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(restoredData, target, { recursive: true, force: true });
    } catch (error) {
      rmSync(target, { recursive: true, force: true });
      if (existsSync(previous)) renameSync(previous, target);
      throw error;
    }
    return { restoredTo: target, previousData: existsSync(previous) ? previous : null, manifest };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function backupDataSize() {
  let total = 0;
  if (!existsSync(config.DATA_DIR)) return 0;
  for (const relative of walk(config.DATA_DIR)) total += statSync(path.join(config.DATA_DIR, relative)).size;
  return total;
}
