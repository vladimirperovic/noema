import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { listLinks, updateLink } from "./store/links.js";
import { safeFetchText } from "./core/outbound.js";

const execFileAsync = promisify(execFile);
const THUMBNAIL_DIR = path.join(config.DATA_DIR, "link-thumbnails");
const THUMBNAIL_RE = /^\/link-thumbnails\/([a-zA-Z0-9_-]+)\.png$/;
const GENERATE_RE = /^\/api\/links\/([^/]+)\/thumbnail$/;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function chromiumPath() {
  const configured = String(process.env.NOEMA_CHROMIUM_PATH || "").trim();
  const candidates = [configured, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

async function createThumbnail(link) {
  const executable = chromiumPath();
  if (!executable) {
    throw new Error("Thumbnail generator is unavailable because Chromium is not installed.");
  }

  // Preflight through Noema's SSRF-safe fetcher. Besides validating the URL, this
  // follows redirects while rejecting private/local network targets before a
  // headless browser is allowed to visit the final public URL.
  const preflight = await safeFetchText(link.url, {
    timeoutMs: 10_000,
    maxBytes: 8 * 1024 * 1024,
    maxRedirects: 5,
    headers: {
      "User-Agent": config.NOEMA_HTTP_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
    },
  });

  await mkdir(THUMBNAIL_DIR, { recursive: true });
  const finalPath = path.join(THUMBNAIL_DIR, `${link.id}.png`);
  const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp.png`;

  try {
    await execFileAsync(executable, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--run-all-compositor-stages-before-draw",
      "--window-size=1440,900",
      "--force-device-scale-factor=1",
      "--virtual-time-budget=6000",
      `--screenshot=${tempPath}`,
      preflight.url,
    ], {
      timeout: 25_000,
      maxBuffer: 1024 * 1024,
    });
    await rename(tempPath, finalPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    if (error?.killed || error?.code === "ETIMEDOUT") throw new Error("Thumbnail generation timed out.");
    throw new Error(`Thumbnail generation failed: ${error?.message || "unknown error"}`);
  }

  const image = `/link-thumbnails/${encodeURIComponent(link.id)}.png?v=${Date.now()}`;
  return updateLink(link.id, { image });
}

export function installLinkThumbnails(server) {
  const original = server.listeners("request")[0];
  if (!original) throw new Error("Noema request handler was not found.");
  server.removeAllListeners("request");

  server.on("request", async (req, res) => {
    const url = new URL(req.url, config.PUBLIC_BASE_URL);
    const pathname = url.pathname;
    const thumbnailMatch = pathname.match(THUMBNAIL_RE);
    const generateMatch = pathname.match(GENERATE_RE);

    if (!thumbnailMatch && !generateMatch) return original(req, res);
    if (!req.noemaUiSession) return json(res, 401, { ok: false, error: "Authentication required." });

    if (thumbnailMatch && req.method === "GET") {
      const id = thumbnailMatch[1];
      try {
        const data = await readFile(path.join(THUMBNAIL_DIR, `${id}.png`));
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": data.length,
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(data);
      } catch {
        return json(res, 404, { ok: false, error: "Thumbnail not found." });
      }
    }

    if (generateMatch && req.method === "POST") {
      const id = decodeURIComponent(generateMatch[1]);
      const link = listLinks({ collection: "" }).find((item) => item.id === id);
      if (!link) return json(res, 404, { ok: false, error: "Link not found." });
      try {
        const updated = await createThumbnail(link);
        return json(res, 200, { ok: true, link: updated });
      } catch (error) {
        return json(res, /Chromium is not installed/.test(error.message) ? 503 : 502, { ok: false, error: error.message });
      }
    }

    res.writeHead(405, { Allow: thumbnailMatch ? "GET" : "POST" });
    res.end();
  });

  return server;
}
