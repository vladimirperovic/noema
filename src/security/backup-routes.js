import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { backupDataSize, createEncryptedBackup } from "../store/backup.js";
import { readEncryptedJson, writeEncryptedJson } from "../store/crypto.js";
import { exportPortableState, restorePortableState } from "./backup-state.js";
import { isBearerAuthorized, json, readJson } from "./http.js";

const snapshotsDir = () => path.join(config.DATA_DIR, "snapshots");

function requireAdmin(req, res, uiSession) {
  if (!config.uiAuthEnabled || uiSession || isBearerAuthorized(req)) return false;
  json(res, 401, { ok: false, error: "An administrator session or API bearer token is required." });
  return true;
}

function counts() {
  const state = exportPortableState().data;
  return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));
}

export async function handleBackupRoute(req, res, url, uiSession) {
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/backup/")) return false;
  if (requireAdmin(req, res, uiSession)) return true;

  if (pathname === "/api/backup/info" && req.method === "GET") {
    json(res, 200, { ok: true, ...counts(), sizes: { total: backupDataSize() }, encryptedArchiveConfigured: Boolean(config.NOEMA_BACKUP_PASSWORD) });
    return true;
  }

  if ((pathname === "/api/backup/download-json" || (pathname === "/api/backup/download" && url.searchParams.get("format") === "json")) && req.method === "GET") {
    const data = Buffer.from(JSON.stringify(exportPortableState(), null, 2));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Length": data.length, "Content-Disposition": 'attachment; filename="noema_metadata_backup.json"', "Cache-Control": "no-store" });
    res.end(data);
    return true;
  }

  if (pathname === "/api/backup/download" && req.method === "GET") {
    try {
      const archive = createEncryptedBackup();
      const name = `noema_full_${new Date().toISOString().replace(/[:.]/g, "-")}.noema`;
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": archive.length, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });
      res.end(archive);
    } catch (error) {
      json(res, error.status || 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (pathname === "/api/backup/snapshot" && req.method === "POST") {
    mkdirSync(snapshotsDir(), { recursive: true, mode: 0o700 });
    const filename = `snapshot_${Date.now()}.enc`;
    writeEncryptedJson(path.join(snapshotsDir(), filename), exportPortableState());
    json(res, 200, { ok: true, filename });
    return true;
  }

  if (pathname === "/api/backup/snapshots" && req.method === "GET") {
    const directory = snapshotsDir();
    const snapshots = existsSync(directory) ? readdirSync(directory)
      .filter((name) => /^snapshot_\d+\.(enc|json)$/.test(name))
      .map((filename) => {
        const match = filename.match(/snapshot_(\d+)/);
        const info = statSync(path.join(directory, filename));
        return { filename, timestamp: Number(match?.[1] || info.mtimeMs), size: info.size };
      }).sort((a, b) => b.timestamp - a.timestamp) : [];
    json(res, 200, { ok: true, snapshots });
    return true;
  }

  if (pathname === "/api/backup/restore-snapshot" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const filename = path.basename(String(body.filename || ""));
      if (!/^snapshot_\d+\.(enc|json)$/.test(filename)) throw Object.assign(new Error("Invalid snapshot filename."), { status: 400 });
      const file = path.join(snapshotsDir(), filename);
      if (!existsSync(file)) throw Object.assign(new Error("Snapshot not found."), { status: 404 });
      const snapshot = filename.endsWith(".enc")
        ? readEncryptedJson(file, null, { throwOnError: true })
        : JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(file, "utf8")));
      json(res, 200, { ok: true, restored: restorePortableState(snapshot) });
    } catch (error) {
      json(res, error.status || 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (pathname === "/api/backup/upload" && req.method === "POST") {
    try {
      const body = await readJson(req, 50 * 1024 * 1024);
      json(res, 200, { ok: true, restored: restorePortableState(body) });
    } catch (error) {
      json(res, error.status || 400, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}
