import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { safeTokenEqual } from "./core/auth.js";
import {
  addFile,
  getFile,
  listFiles,
  loadFiles,
  readFileContent,
  removeFile,
  replaceFileContent,
  updateFile,
} from "./store/files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const MAX_BODY = 175 * 1024 * 1024;
const SESSION_COOKIE = "noema_session";

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

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
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

function cookieValue(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return ""; }
  }
  return "";
}

function verifyLegacySession(req) {
  const token = cookieValue(req, SESSION_COOKIE);
  const [timestampText, signature] = String(token || "").split(".");
  const timestamp = Number(timestampText);
  if (!timestampText || !signature || !Number.isFinite(timestamp)) return false;
  if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return false;
  const secret = config.ENCRYPTION_KEY || config.UI_PASSWORD || config.NOEMA_API_TOKEN || "noema_secret_session_key_2026";
  const expected = createHmac("sha256", secret).update(`noema_session_${timestampText}`).digest("hex");
  return safeTokenEqual(signature, expected);
}

function bearerAuthorized(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(config.NOEMA_API_TOKEN && token && safeTokenEqual(token, config.NOEMA_API_TOKEN));
}

function authorized(req) {
  return Boolean(req.noemaUiSession) || verifyLegacySession(req) || bearerAuthorized(req);
}

function safeDownloadName(name) {
  return String(name || "file").replace(/["\r\n\\/]/g, "_").slice(0, 240) || "file";
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (!authorized(req)) {
    json(res, 401, { ok: false, error: "Sign in to access files." });
    return true;
  }

  if (pathname === "/api/files" && req.method === "GET") {
    json(res, 200, { ok: true, files: listFiles() });
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
      const download = url.searchParams.get("download") === "1";
      const filename = safeDownloadName(result.file.name);
      res.writeHead(200, {
        "Content-Type": result.file.mimeType || "application/octet-stream",
        "Content-Length": result.data.length,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
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

async function serveSharedUiScript(res) {
  const [base, galleryDownloads] = await Promise.all([
    readFile(path.join(PUBLIC_DIR, "noema-header-footer.js")),
    readFile(path.join(PUBLIC_DIR, "gallery-downloads.js")),
  ]);
  const payload = Buffer.concat([base, Buffer.from("\n"), galleryDownloads, Buffer.from("\n")]);
  res.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

export function installFileLibrary(server) {
  loadFiles();
  const original = server.listeners("request")[0];
  if (!original) throw new Error("Noema request handler was not found.");
  server.removeAllListeners("request");
  server.on("request", async (req, res) => {
    try {
      const url = new URL(req.url, config.PUBLIC_BASE_URL);
      if (url.pathname === "/noema-header-footer.js" && req.method === "GET") {
        await serveSharedUiScript(res);
        return;
      }
      if (["/files", "/files/", "/files.html"].includes(url.pathname) && req.method === "GET") {
        if (!authorized(req)) {
          redirect(res, `/login?next=${encodeURIComponent(url.pathname)}`);
          return;
        }
        const page = await readFile(path.join(PUBLIC_DIR, "files.html"));
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": page.length,
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(page);
        return;
      }
      if (url.pathname.startsWith("/api/files") && await handleApi(req, res, url)) return;
      await original(req, res);
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.message || "Internal server error." });
      else res.destroy(error);
    }
  });
  return server;
}
