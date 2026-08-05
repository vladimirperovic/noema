import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { migratePrivateAssetFile, privateAssetInfo, streamPrivateAsset } from "./store/private-assets.js";

const MIME = new Map([
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"], [".gif", "image/gif"],
  [".pdf", "application/pdf"], [".txt", "text/plain; charset=utf-8"], [".md", "text/markdown; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
]);

function safeSegment(value) {
  try {
    const decoded = decodeURIComponent(String(value || ""));
    return decoded && path.basename(decoded) === decoded && !decoded.includes("\0") ? decoded : "";
  } catch { return ""; }
}

function privateRoute(pathname) {
  let match = pathname.match(/^\/link-thumbnails\/([a-zA-Z0-9_-]+\.png)$/);
  if (match) {
    const filename = safeSegment(match[1]);
    return filename ? { filePath: path.join(config.DATA_DIR, "link-thumbnails", filename), kind: "thumbnail", filename } : null;
  }
  match = pathname.match(/^\/uploads\/([^/]+)$/);
  if (match) {
    const filename = safeSegment(match[1]);
    return filename ? { filePath: path.join(config.DATA_DIR, "uploads", filename), kind: "upload", filename } : null;
  }
  match = pathname.match(/^\/(inspiration-files|buildingsite-files)\/([^/]+)\/(originals|thumbs|previews)\/([^/]+)$/);
  if (!match) return null;
  const projectId = safeSegment(match[2]);
  const filename = safeSegment(match[4]);
  if (!projectId || !filename) return null;
  const root = match[1] === "inspiration-files" ? "inspirations" : "buildingsites";
  return {
    filePath: path.join(config.DATA_DIR, root, projectId, match[3], filename),
    kind: "gallery",
    scope: root === "inspirations" ? "inspiration" : "buildingsite",
    projectId,
    filename,
  };
}

function canRead(req, route) {
  if (!config.uiAuthEnabled) return true;
  if (req.noemaUiSession || req.noemaPrivileged) return true;
  const share = req.noemaGalleryShare;
  if (route.kind !== "gallery" || !share) return false;
  if (share.scope === "galleries") return true;
  return share.scope === route.scope && (!share.albumId || share.albumId === route.projectId);
}

function sealRootForRequest(pathname, method) {
  if (method !== "POST") return "";
  if (pathname === "/api/upload") return path.join(config.DATA_DIR, "uploads");
  if (/^\/api\/links\/[^/]+\/thumbnail$/.test(pathname)) return path.join(config.DATA_DIR, "link-thumbnails");
  let match = pathname.match(/^\/api\/inspirations\/([^/]+)\/(images|media)$/);
  if (match) { const id = safeSegment(match[1]); return id ? path.join(config.DATA_DIR, "inspirations", id) : ""; }
  match = pathname.match(/^\/api\/buildingsites\/([^/]+)\/(images|media)$/);
  if (match) { const id = safeSegment(match[1]); return id ? path.join(config.DATA_DIR, "buildingsites", id) : ""; }
  if (pathname === "/api/inspirations") return path.join(config.DATA_DIR, "inspirations");
  if (pathname === "/api/buildingsites") return path.join(config.DATA_DIR, "buildingsites");
  return "";
}

function skipTransient(name) {
  return name.includes(".noema-asset-tmp") || name.includes(".noema-asset-backup") || name.includes(".noema-migration")
    || name.includes(".plaintext-backup") || name.endsWith(".tmp") || name.endsWith(".bak");
}

async function sealDirectory(root) {
  if (!root || !existsSync(root)) return 0;
  let sealed = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && !skipTransient(entry.name) && !(await privateAssetInfo(full)).encrypted) {
        await migratePrivateAssetFile(full);
        sealed += 1;
      }
    }
  }
  await walk(root);
  return sealed;
}

function delayResponseUntilSealed(res, root) {
  const originalEnd = res.end.bind(res);
  let ending = false;
  res.end = function delayedEnd(...args) {
    if (ending) return res;
    ending = true;
    sealDirectory(root).then(() => originalEnd(...args)).catch((error) => {
      console.error("[noema] Private asset sealing failed:", error.message);
      if (!res.headersSent) {
        const body = JSON.stringify({ ok: false, error: "Private content could not be encrypted before storage completed." });
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Length", Buffer.byteLength(body));
        originalEnd(body);
      } else res.destroy(error);
    });
    return res;
  };
}

function parseRange(header, size) {
  const value = String(header || "").trim();
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || !size) return { invalid: true };
  let start;
  let end;
  if (match[1]) {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  } else {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return { invalid: true };
  return { start, end: Math.min(end, size - 1) };
}

async function serve(req, res, route) {
  if (!existsSync(route.filePath)) return false;
  let info = await privateAssetInfo(route.filePath);
  if (!info.encrypted) {
    await migratePrivateAssetFile(route.filePath);
    info = await privateAssetInfo(route.filePath);
  }
  const common = {
    "Content-Type": MIME.get(path.extname(route.filename).toLowerCase()) || "application/octet-stream",
    "Cache-Control": route.kind === "gallery" ? "private, max-age=31536000, immutable" : route.kind === "thumbnail" ? "private, max-age=86400" : "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  if (route.kind === "upload") common["Content-Disposition"] = `inline; filename="${route.filename.replace(/["\\]/g, "_")}"`;
  const range = parseRange(req.headers.range, info.size);
  if (range?.invalid) {
    res.writeHead(416, { ...common, "Content-Range": `bytes */${info.size}` }); res.end(); return true;
  }
  if (range) {
    const length = range.end - range.start + 1;
    res.writeHead(206, { ...common, "Content-Length": String(length), "Content-Range": `bytes ${range.start}-${range.end}/${info.size}` });
    if (req.method !== "HEAD") await streamPrivateAsset(route.filePath, res, range);
    res.end(); return true;
  }
  res.writeHead(200, { ...common, "Content-Length": String(info.size) });
  if (req.method !== "HEAD" && info.size) await streamPrivateAsset(route.filePath, res);
  res.end();
  return true;
}

function unauthorized(res) {
  const body = JSON.stringify({ ok: false, error: "Authentication is required for private content." });
  res.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  res.end(body);
}

export function installPrivateAssetGateway(server) {
  const original = server.listeners("request")[0];
  if (!original) throw new Error("Noema request handler was not found.");
  server.removeAllListeners("request");
  server.on("request", async (req, res) => {
    try {
      const url = new URL(req.url, config.PUBLIC_BASE_URL);
      const route = ["GET", "HEAD"].includes(req.method) ? privateRoute(url.pathname) : null;
      if (route) {
        if (!canRead(req, route)) return unauthorized(res);
        if (await serve(req, res, route)) return;
      }
      const sealRoot = sealRootForRequest(url.pathname, req.method);
      if (sealRoot) delayResponseUntilSealed(res, sealRoot);
      return original(req, res);
    } catch (error) {
      if (!res.headersSent) {
        const body = JSON.stringify({ ok: false, error: "Private content could not be read." });
        res.writeHead(error.status || 500, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
        res.end(body);
      } else res.destroy(error);
    }
  });
  return server;
}
