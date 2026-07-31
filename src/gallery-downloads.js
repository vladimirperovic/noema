import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { listInspirations } from "./store/inspirations.js";
import { listBuildingSites } from "./store/buildingsites.js";

const run = promisify(execFile);
const DOWNLOAD_PATTERN = /^\/api\/(inspirations|buildingsites)\/([^/]+)\/download$/;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

export function matchAlbumDownloadPath(pathname) {
  const match = String(pathname || "").match(DOWNLOAD_PATTERN);
  if (!match) return null;
  try {
    return {
      scope: match[1] === "inspirations" ? "inspiration" : "buildingsite",
      id: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export function safeArchiveBaseName(value, fallback = "album") {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function sourceFilename(value) {
  try {
    const pathname = new URL(String(value || ""), config.PUBLIC_BASE_URL).pathname;
    return path.basename(decodeURIComponent(pathname));
  } catch {
    return path.basename(String(value || ""));
  }
}

function extensionFor(filename) {
  const extension = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ".bin";
}

function albumCollection(scope) {
  return scope === "inspiration" ? listInspirations() : listBuildingSites();
}

function albumStorageRoot(scope) {
  return path.resolve(config.DATA_DIR, scope === "inspiration" ? "inspirations" : "buildingsites");
}

async function createAlbumArchive(scope, album) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "noema-album-"));
  const staging = path.join(tempRoot, "album");
  const archivePath = path.join(tempRoot, "album.zip");
  await mkdir(staging, { recursive: true });

  const storageRoot = albumStorageRoot(scope);
  const originalsRoot = path.resolve(storageRoot, String(album.id), "originals");
  if (!originalsRoot.startsWith(`${storageRoot}${path.sep}`)) {
    await rm(tempRoot, { recursive: true, force: true });
    throw Object.assign(new Error("Invalid album storage path."), { status: 400 });
  }

  let copied = 0;
  const images = Array.isArray(album.images) ? album.images : [];
  for (let index = 0; index < images.length; index += 1) {
    const filename = sourceFilename(images[index]?.original);
    if (!filename) continue;
    const sourcePath = path.resolve(originalsRoot, path.basename(filename));
    if (!sourcePath.startsWith(`${originalsRoot}${path.sep}`)) continue;
    try {
      const info = await stat(sourcePath);
      if (!info.isFile()) continue;
      const targetName = `${String(index + 1).padStart(3, "0")}${extensionFor(filename)}`;
      await copyFile(sourcePath, path.join(staging, targetName));
      copied += 1;
    } catch {
      // Skip metadata entries whose original file is missing.
    }
  }

  if (!copied) {
    await rm(tempRoot, { recursive: true, force: true });
    throw Object.assign(new Error("The album does not contain downloadable originals."), { status: 404 });
  }

  try {
    await run("zip", ["-q", "-r", archivePath, "."], {
      cwd: staging,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    const unavailable = error?.code === "ENOENT";
    throw Object.assign(
      new Error(unavailable ? "The system zip utility is not available." : "The album archive could not be created."),
      { status: unavailable ? 503 : 500 },
    );
  }

  return { tempRoot, archivePath, copied };
}

async function streamAlbumArchive(req, res, route) {
  const album = albumCollection(route.scope).find((item) => item.id === route.id);
  if (!album) {
    json(res, 404, { ok: false, error: "Album not found." });
    return;
  }

  const archive = await createAlbumArchive(route.scope, album);
  const archiveInfo = await stat(archive.archivePath);
  const baseName = safeArchiveBaseName(album.title, `${route.scope}-album`);
  const unicodeName = `${baseName}.zip`;
  const asciiName = `${baseName.normalize("NFKD").replace(/[^\x20-\x7e]+/g, "").replace(/["\\/]/g, "_").trim() || "album"}.zip`;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    rm(archive.tempRoot, { recursive: true, force: true }).catch(() => {});
  };

  res.once("finish", cleanup);
  res.once("close", cleanup);
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Length": archiveInfo.size,
    "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(unicodeName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Noema-Album-Images": String(archive.copied),
  });

  const stream = createReadStream(archive.archivePath);
  stream.on("error", (error) => {
    cleanup();
    if (!res.headersSent) json(res, 500, { ok: false, error: "The album archive could not be read." });
    else res.destroy(error);
  });
  stream.pipe(res);
}

export function installGalleryDownloads(server) {
  const original = server.listeners("request")[0];
  if (!original) throw new Error("Noema request handler was not found.");
  server.removeAllListeners("request");
  server.on("request", async (req, res) => {
    try {
      const url = new URL(req.url, config.PUBLIC_BASE_URL);
      const route = req.method === "GET" ? matchAlbumDownloadPath(url.pathname) : null;
      if (route) {
        await streamAlbumArchive(req, res, route);
        return;
      }
      await original(req, res);
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.message || "Internal server error." });
      else res.destroy(error);
    }
  });
  return server;
}
