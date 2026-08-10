import { mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { listLinks } from "./store/links.js";
import { readPrivateAsset } from "./store/private-assets.js";

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

// Do not launch a general-purpose browser against user-controlled URLs from the
// main Noema container. A DNS-safe HTTP preflight cannot constrain Chromium's
// own DNS resolution, redirects or subresource requests, and the old renderer
// also required --no-sandbox. Generation therefore fails closed until a
// dedicated renderer with strict network egress policy is deployed separately.
async function createThumbnail() {
  await mkdir(THUMBNAIL_DIR, { recursive: true, mode: 0o700 });
  throw Object.assign(
    new Error("Thumbnail generation is disabled until an isolated sandboxed renderer is configured."),
    { status: 503 },
  );
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
      try {
        const data = await readPrivateAsset(path.join(THUMBNAIL_DIR, `${thumbnailMatch[1]}.png`));
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
        await createThumbnail(link);
      } catch (error) {
        return json(res, error?.status || 503, { ok: false, error: error.message });
      }
    }

    res.writeHead(405, { Allow: thumbnailMatch ? "GET" : "POST" });
    res.end();
  });
  return server;
}
