import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { cryptoStatus } from "./store/crypto.js";
import {
  addFile,
  addFileFolder,
  getFile,
  listFileFolders,
  listFiles,
  loadFiles,
  readFileContent,
  removeFile,
  removeFileFolder,
  replaceFileContent,
  updateFile,
  updateFileFolder,
} from "./store/files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const MAX_BODY = 175 * 1024 * 1024;
const INLINE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
]);
let fileStorageLoaded = false;

function ensureFileStorageLoaded() {
  if (fileStorageLoaded) return;
  loadFiles();
  fileStorageLoaded = true;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
  res.end(payload);
}

async function parseJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function authorized(req) {
  return Boolean(req.noemaPrivileged);
}

function safeDownloadName(name) {
  return String(name || "file").replace(/["\r\n\\/]/g, "_").slice(0, 240) || "file";
}

function fileLibraryPayload() {
  const security = cryptoStatus();
  return {
    ok: true,
    files: listFiles(),
    folders: listFileFolders(),
    security: {
      atRestEncrypted: security.initialized,
      algorithm: security.algorithm,
      externalKey: security.externallyDerived,
      keyMode: security.keyMode,
    },
  };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (!authorized(req)) {
    json(res, 401, { ok: false, error: "Sign in to access files." });
    return true;
  }
  ensureFileStorageLoaded();

  if (pathname === "/api/files" && req.method === "GET") {
    json(res, 200, fileLibraryPayload());
    return true;
  }

  if (pathname === "/api/files" && req.method === "POST") {
    try {
      const file = addFile(await parseJson(req));
      json(res, 201, { ok: true, file });
    } catch (error) {
      json(res, error.status || 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (pathname === "/api/file-folders" && req.method === "GET") {
    json(res, 200, { ok: true, folders: listFileFolders() });
    return true;
  }

  if (pathname === "/api/file-folders" && req.method === "POST") {
    try {
      const folder = addFileFolder(await parseJson(req));
      json(res, 201, { ok: true, folder });
    } catch (error) {
      json(res, error.status || 400, { ok: false, error: error.message });
    }
    return true;
  }

  const folderMatch = pathname.match(/^\/api\/file-folders\/([^/]+)$/);
  if (folderMatch && req.method === "PATCH") {
    try {
      const folder = updateFileFolder(decodeURIComponent(folderMatch[1]), await parseJson(req));
      json(res, folder ? 200 : 404, folder ? { ok: true, folder } : { ok: false, error: "Folder not found." });
    } catch (error) {
      json(res, error.status || 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (folderMatch && req.method === "DELETE") {
    try {
      const result = removeFileFolder(decodeURIComponent(folderMatch[1]));
      json(res, result ? 200 : 404, result ? { ok: true, ...result } : { ok: false, error: "Folder not found." });
    } catch (error) {
      json(res, error.status || 400, { ok: false, error: error.message });
    }
    return true;
  }

  const replaceMatch = pathname.match(/^\/api\/files\/([^/]+)\/replace$/);
  if (replaceMatch && req.method === "POST") {
    try {
      const file = replaceFileContent(decodeURIComponent(replaceMatch[1]), await parseJson(req));
      json(res, file ? 200 : 404, file ? { ok: true, file } : { ok: false, error: "File not found." });
    } catch (error) {
      json(res, error.status || 400, { ok: false, error: error.message });
    }
    return true;
  }

  const contentMatch = pathname.match(/^\/api\/files\/([^/]+)\/content$/);
  if (contentMatch && req.method === "GET") {
    try {
      const result = readFileContent(decodeURIComponent(contentMatch[1]));
      if (!result) {
        json(res, 404, { ok: false, error: "File not found." });
        return true;
      }
      const requestedDownload = url.searchParams.get("download") === "1";
      const inlineSafe = INLINE_MIME_TYPES.has(String(result.file.mimeType || "").toLowerCase());
      const disposition = !requestedDownload && inlineSafe ? "inline" : "attachment";
      res.writeHead(200, {
        "Content-Type": result.file.mimeType || "application/octet-stream",
        "Content-Length": result.data.length,
        "Content-Disposition": `${disposition}; filename="${safeDownloadName(result.file.name)}"`,
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cache-Control": "private, no-store",
      });
      res.end(result.data);
    } catch (error) {
      json(res, error.status || 500, { ok: false, error: error.message });
    }
    return true;
  }

  const fileMatch = pathname.match(/^\/api\/files\/([^/]+)$/);
  if (fileMatch && req.method === "GET") {
    const file = getFile(decodeURIComponent(fileMatch[1]));
    json(res, file ? 200 : 404, file ? { ok: true, file } : { ok: false, error: "File not found." });
    return true;
  }

  if (fileMatch && req.method === "PATCH") {
    try {
      const file = updateFile(decodeURIComponent(fileMatch[1]), await parseJson(req));
      json(res, file ? 200 : 404, file ? { ok: true, file } : { ok: false, error: "File not found." });
    } catch (error) {
      json(res, error.status || 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (fileMatch && req.method === "DELETE") {
    const removed = removeFile(decodeURIComponent(fileMatch[1]));
    json(res, removed ? 200 : 404, removed ? { ok: true } : { ok: false, error: "File not found." });
    return true;
  }

  return false;
}

function injectStreamingClient(page) {
  const html = Buffer.isBuffer(page) ? page.toString("utf8") : String(page);
  if (html.includes('/files-streaming-upload.js')) return Buffer.from(html, "utf8");
  return Buffer.from(html.replace(/<\/head>/i, '  <script src="/files-streaming-upload.js" defer></script>\n</head>'), "utf8");
}

export function installFileLibrary(server) {
  const original = server.listeners("request")[0];
  if (!original) throw new Error("Noema request handler was not found.");
  server.removeAllListeners("request");
  server.on("request", async (req, res) => {
    try {
      const url = new URL(req.url, config.PUBLIC_BASE_URL);
      if ((url.pathname === "/files" || url.pathname === "/files/") && req.method === "GET" && authorized(req)) {
        ensureFileStorageLoaded();
        const page = injectStreamingClient(await readFile(path.join(PUBLIC_DIR, "files.html")));
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": page.length,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(page);
        return;
      }
      if ((url.pathname.startsWith("/api/files") || url.pathname.startsWith("/api/file-folders")) && await handleApi(req, res, url)) return;
      return original(req, res);
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.message || "Internal server error." });
      else res.destroy(error);
    }
  });
  return server;
}
