import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { encryptAssetChunk } from "./store/crypto.js";
import { privateAssetInfo, streamPrivateAsset } from "./store/private-assets.js";
import { fileStoragePath, getFile, getFileFolder, registerStreamedFile, registerStreamedReplacement, streamedStoredName } from "./store/files.js";

const MAGIC = Buffer.from("NOEMA-ASSET-V1", "ascii");
const VERSION = 1;
const HEADER_SIZE = 64;
const CHUNK_SIZE = 1024 * 1024;
const MAX_FILE_BYTES = 120 * 1024 * 1024;
const CHUNK_OVERHEAD = 12 + 16;
const INLINE_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "text/plain"]);

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.end(payload);
}

function decodeHeader(req, name, fallback = "") { const value = String(req.headers[name] || ""); if (!value) return fallback; try { return decodeURIComponent(value); } catch { return fallback; } }
function safeDownloadName(name) { return String(name || "file").replace(/["\r\n\\/]/g, "_").slice(0, 240) || "file"; }
function declaredLength(req) { const size = Number(String(req.headers["content-length"] || "")); if (!Number.isSafeInteger(size) || size <= 0) throw Object.assign(new Error("Streaming upload requires a known positive Content-Length."), { status: 411 }); if (size > MAX_FILE_BYTES) throw Object.assign(new Error("File is larger than 120 MB."), { status: 413 }); return size; }
function validateFolder(folderId) { if (!folderId) return ""; if (!getFileFolder(folderId)) throw Object.assign(new Error("Folder not found."), { status: 400 }); return folderId; }

function makeHeader(size, assetId) { const header = Buffer.alloc(HEADER_SIZE); MAGIC.copy(header, 0); header.writeUInt32LE(VERSION, 16); header.writeUInt32LE(CHUNK_SIZE, 20); header.writeBigUInt64LE(BigInt(size), 24); assetId.copy(header, 32); return header; }
function chunkAad(assetId, size, index) { return Buffer.from(`noema:private-asset:v${VERSION}:${assetId.toString("hex")}:${size}:${CHUNK_SIZE}:${index}`, "utf8"); }

async function writeEncryptedRequest(req, targetPath, size) {
  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const stagePath = `${targetPath}.${randomUUID()}.stream-upload`;
  const assetId = randomBytes(16);
  const handle = await open(stagePath, "wx", 0o600);
  let total = 0, index = 0, position = HEADER_SIZE, pending = Buffer.alloc(0);
  try {
    const header = makeHeader(size, assetId);
    await handle.write(header, 0, header.length, 0);
    const flushChunk = async (plain) => {
      const encrypted = encryptAssetChunk(plain, chunkAad(assetId, size, index));
      if (encrypted.length !== plain.length + CHUNK_OVERHEAD) throw new Error("Unexpected encrypted chunk size.");
      await handle.write(encrypted, 0, encrypted.length, position);
      position += encrypted.length; index += 1;
    };
    for await (const incoming of req) {
      const chunk = Buffer.isBuffer(incoming) ? incoming : Buffer.from(incoming);
      total += chunk.length;
      if (total > size || total > MAX_FILE_BYTES) throw Object.assign(new Error("Upload exceeds declared size."), { status: 413 });
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= CHUNK_SIZE) { await flushChunk(pending.subarray(0, CHUNK_SIZE)); pending = pending.subarray(CHUNK_SIZE); }
    }
    if (total !== size) throw Object.assign(new Error("Upload ended before the complete file was received."), { status: 400 });
    if (pending.length) await flushChunk(pending);
    await handle.sync(); await handle.close(); return stagePath;
  } catch (error) { await handle.close().catch(() => {}); await rm(stagePath, { force: true }).catch(() => {}); throw error; }
}

async function commitStage(stagePath, targetPath, commitMetadata) {
  const backupPath = `${targetPath}.${randomUUID()}.stream-backup`;
  const hadTarget = existsSync(targetPath); let targetMoved = false;
  try { if (hadTarget) { await rename(targetPath, backupPath); targetMoved = true; } await rename(stagePath, targetPath); const result = await commitMetadata(); if (targetMoved) await rm(backupPath, { force: true }); return result; }
  catch (error) { await rm(targetPath, { force: true }).catch(() => {}); if (targetMoved && existsSync(backupPath)) await rename(backupPath, targetPath).catch(() => {}); await rm(stagePath, { force: true }).catch(() => {}); throw error; }
}

async function uploadNew(req, res) {
  const size = declaredLength(req);
  const name = decodeHeader(req, "x-noema-filename", "Untitled file").trim().slice(0, 240) || "Untitled file";
  const folderId = validateFolder(decodeHeader(req, "x-noema-folder", ""));
  const mimeType = String(req.headers["content-type"] || "application/octet-stream").slice(0, 160);
  const id = randomUUID(); const storedName = streamedStoredName(id, name); const targetPath = fileStoragePath(storedName);
  const stagePath = await writeEncryptedRequest(req, targetPath, size);
  const file = await commitStage(stagePath, targetPath, async () => registerStreamedFile({ id, name, folderId, storedName, mimeType, size }));
  json(res, 201, { ok: true, file });
}

async function replaceExisting(req, res, id) {
  const current = getFile(id); if (!current) { json(res, 404, { ok: false, error: "File not found." }); return; }
  const size = declaredLength(req); const name = decodeHeader(req, "x-noema-filename", current.name).trim().slice(0, 240) || current.name;
  const mimeType = String(req.headers["content-type"] || current.mimeType || "application/octet-stream").slice(0, 160);
  const storedName = streamedStoredName(current.id, name); const targetPath = fileStoragePath(storedName); const oldPath = fileStoragePath(current.storedName);
  const stagePath = await writeEncryptedRequest(req, targetPath, size);
  const file = await commitStage(stagePath, targetPath, async () => registerStreamedReplacement(current.id, { name, storedName, mimeType, size }));
  if (oldPath !== targetPath) await rm(oldPath, { force: true }).catch(() => {});
  json(res, 200, { ok: true, file });
}

function parseRange(header, size) {
  if (!header) return null; const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim()); if (!match) return { invalid: true };
  let start, end;
  if (match[1] === "" && match[2] !== "") { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) return { invalid: true }; start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] === "" ? size - 1 : Number(match[2]); }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return { invalid: true };
  return { start, end: Math.min(end, size - 1) };
}

async function streamContent(req, res, url, id) {
  const file = getFile(id); if (!file || file.assetFormat !== "private-asset-v1") return false;
  const filePath = fileStoragePath(file.storedName); if (!existsSync(filePath)) { json(res, 404, { ok: false, error: "File content was not found." }); return true; }
  const info = await privateAssetInfo(filePath); if (!info.encrypted) throw Object.assign(new Error("Streaming file is not encrypted in the expected format."), { status: 500 });
  const requestedDownload = url.searchParams.get("download") === "1"; const inlineSafe = INLINE_MIME_TYPES.has(String(file.mimeType || "").toLowerCase()); const disposition = !requestedDownload && inlineSafe ? "inline" : "attachment";
  const range = parseRange(req.headers.range, info.size);
  if (range?.invalid) { res.writeHead(416, { "Content-Range": `bytes */${info.size}`, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" }); res.end(); return true; }
  const start = range ? range.start : 0; const end = range ? range.end : Math.max(0, info.size - 1); const contentLength = info.size ? end - start + 1 : 0;
  const headers = { "Content-Type": file.mimeType || "application/octet-stream", "Content-Length": String(contentLength), "Content-Disposition": `${disposition}; filename="${safeDownloadName(file.name)}"`, "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
  res.writeHead(range ? 206 : 200, headers); if (req.method === "HEAD" || !info.size) { res.end(); return true; }
  await streamPrivateAsset(filePath, res, { start, end }); res.end(); return true;
}

export function installStreamingFileLibrary(server) {
  const original = server.listeners("request")[0]; if (!original) throw new Error("Noema request handler was not found.");
  server.removeAllListeners("request");
  server.on("request", async (req, res) => {
    try {
      const url = new URL(req.url, config.PUBLIC_BASE_URL); const pathname = url.pathname;
      if (!req.noemaPrivileged && (pathname === "/api/files/raw" || pathname.includes("/replace-raw"))) { json(res, 401, { ok: false, error: "Sign in to access files." }); return; }
      if (pathname === "/api/files/raw" && req.method === "POST") { await uploadNew(req, res); return; }
      const replace = pathname.match(/^\/api\/files\/([^/]+)\/replace-raw$/); if (replace && req.method === "POST") { await replaceExisting(req, res, decodeURIComponent(replace[1])); return; }
      const content = pathname.match(/^\/api\/files\/([^/]+)\/content$/); if (content && ["GET", "HEAD"].includes(req.method)) { if (await streamContent(req, res, url, decodeURIComponent(content[1]))) return; }
      await original(req, res);
    } catch (error) { if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.message || "Server error." }); else res.destroy(error); }
  });
  return server;
}
