import { resolveIsoDay as resolveIso } from "./core/utils.js";

import http from "node:http";
import { readFile, writeFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { registry } from "./core/registry.js";
import { bearerFromHeader, checkToolAuth } from "./core/auth.js";
import { buildOpenApiDocument } from "./core/openapi.js";
import { validateBySchema } from "./core/validate.js";
import { handleMcpRequest, mcpMethodNotAllowed } from "./core/mcp.js";
import { registerNoemaTools } from "./modules/tools.js";
import {
  addTask,
  updateTask,
  removeTask,
  listTasks,
  loadStore,
  replaceTasks,
} from "./store/todos.js";
import {
  addNote,
  updateNote,
  removeNote,
  listNotes,
  loadNotes,
  replaceNotes,
} from "./store/notes.js";
import {
  addDocument,
  updateDocument,
  removeDocument,
  listDocuments,
  loadDocuments,
  replaceDocuments,
} from "./store/documents.js";
import {
  createLinkWithMeta,
  updateLink,
  removeLink,
  bulkRemoveLinks,
  bulkArchiveLinks,
  listLinks,
  loadLinks,
  replaceLinks,
  fetchArticleText
} from "./store/links.js";
import {
  addInspiration,
  updateInspiration,
  removeInspiration,
  listInspirations,
  loadInspirations,
  replaceInspirations,
} from "./store/inspirations.js";
import {
  addBuildingSite,
  updateBuildingSite,
  removeBuildingSite,
  listBuildingSites,
  loadBuildingSites,
  replaceBuildingSites,
  updateBuildingSiteImage,
  addBuildingSiteHotspot,
  removeBuildingSiteHotspot,
} from "./store/buildingsites.js";
import { getSystemStats } from "./store/system.js";
import { getLiveStats, normalizeStatsDays } from "./services/analytics.js";
import {
  getCalendarEvents,
  isCalendarConfigured,
  isCalendarConnected,
} from "./store/calendar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

const SERVICE = { name: "noema", version: "0.1.0" };
const CORS_ORIGIN = config.NOEMA_CORS_ORIGIN;
const INSPIRATION_DIR = path.resolve(config.DATA_DIR, "inspirations");
const BUILDINGSITE_DIR = path.resolve(config.DATA_DIR, "buildingsites");
const INSPIRATION_UPLOAD_LIMIT = 120 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const reverseGeocodeCache = new Map();
let reverseGeocodeQueue = Promise.resolve();
let lastReverseGeocodeAt = 0;
function reverseAddressLabel(result) {
  const address = result?.address || {};
  const street = address.road || address.pedestrian || address.residential || address.footway || "";
  const streetLine = [street, address.house_number].filter(Boolean).join(" ");
  const locality = address.city || address.town || address.village || address.municipality || "";
  return [streetLine, locality].filter((part, index, parts) => part && parts.indexOf(part) === index).join(", ")
    || String(result?.display_name || "").trim();
}

async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (reverseGeocodeCache.has(key)) return reverseGeocodeCache.get(key);
  const request = async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastReverseGeocodeAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastReverseGeocodeAt = Date.now();
    const endpoint = new URL("https://nominatim.openstreetmap.org/reverse");
    endpoint.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lon), zoom: "18", addressdetails: "1", "accept-language": "sr-Latn,sr,en" });
    const response = await fetch(endpoint, { headers: { "User-Agent": config.NOEMA_HTTP_USER_AGENT, Accept: "application/json" } });
    if (!response.ok) throw new Error("Servis za adrese trenutno nije dostupan.");
    const label = reverseAddressLabel(await response.json());
    reverseGeocodeCache.set(key, label);
    return label;
  };
  const result = reverseGeocodeQueue.then(request, request);
  reverseGeocodeQueue = result.catch(() => {});
  return result;
}

function decodeUploadedImage(data, type, maxBytes = 10 * 1024 * 1024) {
  if (!IMAGE_TYPES.has(type) || typeof data !== "string" || !data) return null;
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(data)) return null;
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > maxBytes) return null;
  return buffer;
}

function normalizeOptionalHttpUrl(raw) {
  if (!raw) return "";
  try {
    const parsed = new URL(String(raw).trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function normalizeOptionalDate(raw) {
  if (!raw) return "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((tag) => String(tag).trim().replace(/^#+/, "").slice(0, 40))
    .filter(Boolean)
    .slice(0, 30);
}

async function listInspirationsWithStorage() {
  return Promise.all(listInspirations().map(async (item) => {
    const sizes = await Promise.all(item.images.map(async (image) => {
      if (Number.isFinite(image.size)) return image.size;
      try {
        const filename = path.basename(String(image.original || ""));
        if (!filename) return 0;
        return (await stat(path.join(INSPIRATION_DIR, item.id, "originals", filename))).size;
      } catch {
        return 0;
      }
    }));
    return { ...item, totalBytes: sizes.reduce((total, size) => total + size, 0) };
  }));
}

async function listBuildingSitesWithStorage() {
  const items = listBuildingSites();
  return Promise.all(items.map(async (item) => {
    const images = Array.isArray(item?.images) ? item.images : [];
    const sizes = await Promise.all(images.map(async (image) => {
      if (image && Number.isFinite(image.size)) return image.size;
      try {
        const filename = path.basename(String(image?.original || ""));
        if (!filename) return 0;
        return (await stat(path.join(BUILDINGSITE_DIR, item.id, "originals", filename))).size;
      } catch {
        return 0;
      }
    }));
    return {
      ...item,
      tags: Array.isArray(item?.tags) ? item.tags : [],
      images,
      totalBytes: sizes.reduce((total, size) => total + size, 0)
    };
  }));
}



/** Mali response helper — šalje JSON sa statusom. */
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** CORS + sigurnosni header-i. */
function setBaseHeaders(res, extra = {}) {
  const headers = { ...extra };
  headers["Access-Control-Allow-Origin"] = CORS_ORIGIN;
  if (CORS_ORIGIN !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS";
  headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  headers["X-Content-Type-Options"] = "nosniff";
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

/** Pročitaj sirovo telo zahteva (Promise). */
function readBody(req, limit = "1mb") {
  return new Promise((resolve, reject) => {
    const limitBytes = typeof limit === "number" ? limit : 1024 * 1024;
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error("Telo zahteva preveliko."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Sastavlja HTTP server. Port the reference implementation `server.ts` obrasca, ali vanilla node http.
 */
export function createServer() {
  // 1) Moduli registruju svoje alate u deljeni registar.
  registerNoemaTools();

  // 2) Učitaj storage sa diska.
  loadStore();
  loadNotes();
  loadDocuments();
  loadLinks();
  loadInspirations();
  loadBuildingSites();

  const server = http.createServer(async (req, res) => {
    // CORS preflight.
    if (req.method === "OPTIONS") {
      setBaseHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, config.PUBLIC_BASE_URL);
    const pathname = url.pathname;
    const method = req.method;
    try {
      // Health check.      // Health check.
      if (pathname === "/healthz" && method === "GET") {
        setBaseHeaders(res);
        return json(res, 200, { ok: true, service: SERVICE.name, version: SERVICE.version });
      }

      // OpenAPI šema — namerno javna da je LLM/klijent može pročitati.
      if (pathname === "/openapi.json" && method === "GET") {
        setBaseHeaders(res);
        return json(res, 200, buildOpenApiDocument(registry));
      }

      // MCP endpoint      // MCP endpoint (Streamable HTTP, stateless).
      if (pathname === "/mcp") {
        if (method !== "POST") {
          setBaseHeaders(res);
          return mcpMethodNotAllowed(res);
        }
        return await handleMcpRoute(req, res);
      }

      // --- REST za UI: /api/todos ---      // --- REST za UI: /api/todos ---
      if (pathname === "/api/todos" && method === "GET") {
        setBaseHeaders(res);
        const yesterdayISO = resolveIso("yesterday");
        const grouped = { yesterday: [], today: [], tomorrow: [] };
        for (const t of listTasks(undefined, { includeDone: true })) {
          // Sakrij taskove starije od juče — ostaju samo u arhivi.
          if (t.scheduledFor < yesterdayISO) continue;
          if (grouped[t.day]) grouped[t.day].push(t);
        }
        return json(res, 200, { ok: true, todos: grouped });
      }

      // Arhiva: svi taskovi sa apsolutnim datumom (scheduledFor) — za /arhiva stranicu.
      if (pathname === "/api/archive" && method === "GET") {
        setBaseHeaders(res);
        let backupDates = [];
        try {
          const snapPath = path.resolve(config.DATA_DIR, "snapshots");
          if (existsSync(snapPath)) {
            const files = await readdir(snapPath);
            backupDates = files
              .filter(f => f.startsWith("snapshot_") && f.endsWith(".json"))
              .map(f => {
                const ts = Number(f.replace("snapshot_", "").replace(".json", ""));
                const d = new Date(ts);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                return `${y}-${m}-${day}`;
              });
          }
        } catch {}
        return json(res, 200, { ok: true, todos: listTasks(undefined, { includeDone: true }), notes: listNotes(), documents: listDocuments(), links: listLinks({ collection: "" }), backupDates });
      }

      // --- REST za UI: /api/notes ---
      if (pathname === "/api/notes" && method === "GET") {
        setBaseHeaders(res);
        return json(res, 200, { ok: true, notes: listNotes() });
      }

      if (pathname === "/api/notes" && method === "POST") {
        setBaseHeaders(res);
        const reqBody = await parseJson(req);
        if (!reqBody.ok) return json(res, 400, reqBody.err);
        const { title, body, labels, pinned, archived } = reqBody.value;
        if (!title || !String(title).trim()) {
          return json(res, 400, { ok: false, error: "Naslov je obavezan." });
        }
        const note = addNote(title, body, labels, pinned, archived);
        return json(res, 201, { ok: true, note });
      }

      // /api/notes/:id  (PATCH, DELETE)
      const noteMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
      if (noteMatch) {
        const id = decodeURIComponent(noteMatch[1]);
        if (method === "PATCH") {
          setBaseHeaders(res);
          const body = await parseJson(req);
          if (!body.ok) return json(res, 400, body.err);
          const updated = updateNote(id, body.value);
          if (!updated) return json(res, 404, { ok: false, error: "Bilješka nije pronađena." });
          return json(res, 200, { ok: true, note: updated });
        }
        if (method === "DELETE") {
          setBaseHeaders(res);
          const removed = removeNote(id);
          if (!removed) return json(res, 404, { ok: false, error: "Bilješka nije pronađena." });
          return json(res, 200, { ok: true, id });
        }
      }

      // --- REST za UI: /api/documents ---
      if (pathname === "/api/documents" && method === "GET") {
        setBaseHeaders(res);
        return json(res, 200, { ok: true, documents: listDocuments() });
      }

      if (pathname === "/api/documents" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        const { title, body: docBody, label } = body.value;
        if (!title || !String(title).trim()) {
          return json(res, 400, { ok: false, error: "Naslov je obavezan." });
        }
        const doc = addDocument(title, docBody, label);
        return json(res, 201, { ok: true, document: doc });
      }

      // /api/documents/:id  (PATCH, DELETE)
      const docMatch = pathname.match(/^\/api\/documents\/([^/]+)$/);
      if (docMatch) {
        const id = decodeURIComponent(docMatch[1]);
        if (method === "PATCH") {
          setBaseHeaders(res);
          const body = await parseJson(req);
          if (!body.ok) return json(res, 400, body.err);
          const updated = updateDocument(id, body.value);
          if (!updated) return json(res, 404, { ok: false, error: "Dokument nije pronađen." });
          return json(res, 200, { ok: true, document: updated });
        }
        if (method === "DELETE") {
          setBaseHeaders(res);
          const removed = removeDocument(id);
          if (!removed) return json(res, 404, { ok: false, error: "Dokument nije pronađen." });
          return json(res, 200, { ok: true, id });
        }
      }

      // --- REST za UI: /api/links (linkdump) ---
      if (pathname === "/api/links" && method === "GET") {
        setBaseHeaders(res);
        const q = url.searchParams.get("q") || "";
        const label = url.searchParams.get("label") || "";
        return json(res, 200, { ok: true, links: listLinks({ q, label, collection: "" }) });
      }

      if (pathname === "/api/links" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        if (!body.value.url || !String(body.value.url).trim()) {
          return json(res, 400, { ok: false, error: "URL je obavezan." });
        }
        try {
          const { link, existed } = await createLinkWithMeta(body.value);
          return json(res, existed ? 200 : 201, { ok: true, link, existed });
        } catch (err) {
          return json(res, 400, { ok: false, error: err.message });
        }
      }

      // --- REST za UI: /api/ai-projects ---
      if (pathname === "/api/ai-projects" && method === "GET") {
        setBaseHeaders(res);
        const q = url.searchParams.get("q") || "";
        return json(res, 200, { ok: true, links: listLinks({ q, collection: "ai-projects" }) });
      }

      if (pathname === "/api/ai-projects" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        if (!body.value.url || !String(body.value.url).trim()) {
          return json(res, 400, { ok: false, error: "URL je obavezan." });
        }
        try {
          const { link, existed } = await createLinkWithMeta({ ...body.value, collection: "ai-projects" });
          return json(res, existed ? 200 : 201, { ok: true, link, existed });
        } catch (err) {
          return json(res, 400, { ok: false, error: err.message });
        }
      }

      const aiProjectMatch = pathname.match(/^\/api\/ai-projects\/([^/]+)$/);
      if (aiProjectMatch) {
        const id = decodeURIComponent(aiProjectMatch[1]);
        const project = listLinks({ collection: "ai-projects" }).find((link) => link.id === id);
        if (!project) return json(res, 404, { ok: false, error: "AI projekat nije pronađen." });
        if (method === "PATCH") {
          setBaseHeaders(res);
          const body = await parseJson(req);
          if (!body.ok) return json(res, 400, body.err);
          const updated = updateLink(id, { ...body.value, collection: "ai-projects" });
          return json(res, 200, { ok: true, link: updated });
        }
        if (method === "DELETE") {
          setBaseHeaders(res);
          removeLink(id);
          return json(res, 200, { ok: true, id });
        }
      }

      // /api/links/:id  (PATCH, DELETE)
      const linkMatch = pathname.match(/^\/api\/links\/(?!bulk-delete$|bulk-archive$)([^/]+)$/);
      if (linkMatch) {
        const id = decodeURIComponent(linkMatch[1]);
        const link = listLinks({ collection: "" }).find((item) => item.id === id);
        if (!link) return json(res, 404, { ok: false, error: "Link nije pronađen." });
        if (method === "PATCH") {
          setBaseHeaders(res);
          const body = await parseJson(req);
          if (!body.ok) return json(res, 400, body.err);
          const updated = updateLink(id, { ...body.value, collection: "" });
          return json(res, 200, { ok: true, link: updated });
        }
        if (method === "DELETE") {
          setBaseHeaders(res);
          removeLink(id);
          return json(res, 200, { ok: true, id });
        }
      }
      
      const linkReadMatch = pathname.match(/^\/api\/links\/([^/]+)\/read$/);
      if (linkReadMatch && method === "GET") {
        setBaseHeaders(res);
        const id = decodeURIComponent(linkReadMatch[1]);
        const allLinks = listLinks({ collection: "" });
        const l = allLinks.find(x => x.id === id);
        if (!l) return json(res, 404, { ok: false, error: "Link nije pronađen." });
        
        try {
          const text = await fetchArticleText(l.url);
          return json(res, 200, { ok: true, text, title: l.title, url: l.url });
        } catch (err) {
          return json(res, 500, { ok: false, error: err.message });
        }
      }

      // Bulk operacije na linkovima
      if (pathname === "/api/links/bulk-delete" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        const ids = body.value.ids;
        if (!Array.isArray(ids)) return json(res, 400, { ok: false, error: "ids mora biti niz." });
        const ordinaryIds = new Set(listLinks({ collection: "" }).map((link) => link.id));
        const count = bulkRemoveLinks(ids.filter((id) => ordinaryIds.has(id)));
        return json(res, 200, { ok: true, count });
      }

      if (pathname === "/api/links/bulk-archive" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        const ids = body.value.ids;
        const archived = body.value.archived !== false;
        if (!Array.isArray(ids)) return json(res, 400, { ok: false, error: "ids mora biti niz." });
        const ordinaryIds = new Set(listLinks({ collection: "" }).map((link) => link.id));
        const count = bulkArchiveLinks(ids.filter((id) => ordinaryIds.has(id)), archived);
        return json(res, 200, { ok: true, count });
      }

      if (pathname === "/api/geocode/reverse" && method === "GET") {
        setBaseHeaders(res);
        const latParam = url.searchParams.get("lat");
        const lonParam = url.searchParams.get("lon");
        const lat = Number(latParam);
        const lon = Number(lonParam);
        if (latParam === null || lonParam === null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          return json(res, 400, { ok: false, error: "GPS koordinate nisu ispravne." });
        }
        try {
          const address = await reverseGeocode(lat, lon);
          return json(res, 200, { ok: true, address });
        } catch (err) {
          return json(res, 502, { ok: false, error: err.message || "Adresa nije pronađena." });
        }
      }

      // --- Inspiration galerija ---      // --- Inspiration galerija ---
      if (pathname === "/api/inspirations" && method === "GET") {
        setBaseHeaders(res);
        return json(res, 200, { ok: true, inspirations: await listInspirationsWithStorage() });
      }

      if (pathname === "/api/inspirations" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req, INSPIRATION_UPLOAD_LIMIT);
        if (!body.ok) return json(res, 400, body.err);
        const title = String(body.value.title || "").trim();
        const sourceUrl = normalizeOptionalHttpUrl(body.value.sourceUrl);
        const address = String(body.value.address || "").trim().slice(0, 240);
        const label = String(body.value.label || "").trim().slice(0, 40);
        const images = body.value.images;
        if (!title) return json(res, 400, { ok: false, error: "Naziv je obavezan." });
        if (sourceUrl === null) return json(res, 400, { ok: false, error: "Link mora početi sa http:// ili https://." });
        if (!Array.isArray(images) || images.length < 1 || images.length > 35) {
          return json(res, 400, { ok: false, error: "Dodaj od 1 do 35 slika." });
        }

        const projectId = randomUUID();
        const projectDir = path.join(INSPIRATION_DIR, projectId);
        const originalsDir = path.join(projectDir, "originals");
        const thumbsDir = path.join(projectDir, "thumbs");
        try {
          await mkdir(originalsDir, { recursive: true });
          await mkdir(thumbsDir, { recursive: true });
          const storedImages = [];
          for (let index = 0; index < images.length; index++) {
            const image = images[index] || {};
            const original = decodeUploadedImage(image.data, image.type);
            const thumbnail = decodeUploadedImage(image.thumbnailData, "image/jpeg", 900 * 1024);
            if (!original || !thumbnail) throw new Error(`Slika ${index + 1} nije podržana ili je prevelika.`);
            const imageId = randomUUID();
            const ext = IMAGE_TYPES.get(image.type);
            const originalName = `${String(index + 1).padStart(2, "0")}-${imageId}.${ext}`;
            const thumbName = `${String(index + 1).padStart(2, "0")}-${imageId}.jpg`;
            await writeFile(path.join(originalsDir, originalName), original);
            await writeFile(path.join(thumbsDir, thumbName), thumbnail);
            storedImages.push({
              id: imageId,
              name: path.basename(String(image.name || `slika-${index + 1}`)),
              size: original.length,
              original: `/inspiration-files/${projectId}/originals/${originalName}`,
              thumbnail: `/inspiration-files/${projectId}/thumbs/${thumbName}`,
            });
          }
          const inspiration = addInspiration({ id: projectId, title, sourceUrl, address, label, images: storedImages });
          return json(res, 201, { ok: true, inspiration });
        } catch (err) {
          await rm(projectDir, { recursive: true, force: true }).catch(() => {});
          return json(res, 400, { ok: false, error: err.message || "Slike nisu sačuvane." });
        }
      }

      const inspirationMatch = pathname.match(/^\/api\/inspirations\/([^/]+)$/);
      if (inspirationMatch) {
        const id = decodeURIComponent(inspirationMatch[1]);
        const item = listInspirations().find((entry) => entry.id === id);
        if (!item) return json(res, 404, { ok: false, error: "Inspiracija nije pronađena." });
        if (method === "PATCH") {
          setBaseHeaders(res);
          const body = await parseJson(req);
          if (!body.ok) return json(res, 400, body.err);
          const patch = { ...body.value };
          if (Object.hasOwn(body.value, "label")) patch.label = String(body.value.label || "").trim().slice(0, 40);
          if (Object.hasOwn(body.value, "address")) patch.address = String(body.value.address || "").trim().slice(0, 240);
          if (Object.hasOwn(body.value, "sourceUrl")) {
            const sourceUrl = normalizeOptionalHttpUrl(body.value.sourceUrl);
            if (sourceUrl === null) return json(res, 400, { ok: false, error: "Link mora početi sa http:// ili https://." });
            patch.sourceUrl = sourceUrl;
          }
          if (Object.hasOwn(body.value, "featuredImageId")) {
            const featuredImageId = String(body.value.featuredImageId || "").trim();
            if (featuredImageId && !item.images.some((image) => image.id === featuredImageId)) {
              return json(res, 400, { ok: false, error: "Izabrana naslovna fotografija nije u ovom albumu." });
            }
            patch.featuredImageId = featuredImageId;
          }
          const inspiration = updateInspiration(id, patch);
          return json(res, 200, { ok: true, inspiration });
        }
        if (method === "DELETE") {
          setBaseHeaders(res);
          const projectDir = path.resolve(INSPIRATION_DIR, id);
          if (!projectDir.startsWith(INSPIRATION_DIR + path.sep)) {
            return json(res, 400, { ok: false, error: "Neispravna putanja." });
          }
          await rm(projectDir, { recursive: true, force: true });
          removeInspiration(id);
          return json(res, 200, { ok: true, id });
        }
      }

      const inspirationFileMatch = pathname.match(/^\/inspiration-files\/([^/]+)\/(originals|thumbs)\/([^/]+)$/);
      if (inspirationFileMatch && method === "GET") {
        const [, projectId, size, filename] = inspirationFileMatch;
        const filePath = path.resolve(INSPIRATION_DIR, projectId, size, filename);
        if (!filePath.startsWith(INSPIRATION_DIR + path.sep)) return json(res, 400, { ok: false, error: "Neispravna putanja." });
        try {
          const data = await readFile(filePath);
          const type = MIME[path.extname(filename).toLowerCase()] || "application/octet-stream";
          setBaseHeaders(res, { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable" });
          res.writeHead(200);
          res.end(data);
          return;
        } catch {
          return json(res, 404, { ok: false, error: "Slika nije pronađena." });
        }
      }

      // --- Building Site galerija ---
      if (pathname === "/api/buildingsites" && method === "GET") {
        setBaseHeaders(res);
        return json(res, 200, { ok: true, buildingSites: await listBuildingSitesWithStorage() });
      }

      if (pathname === "/api/buildingsites" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req, INSPIRATION_UPLOAD_LIMIT);
        if (!body.ok) return json(res, 400, body.err);
        const title = String(body.value.title || "").trim();
        const location = String(body.value.location ?? body.value.sourceUrl ?? "").trim().slice(0, 160);
        const address = String(body.value.address || "").trim().slice(0, 240);
        const documentUrl = normalizeOptionalHttpUrl(body.value.documentUrl);
        const label = String(body.value.label || "").trim().slice(0, 40);
        const tags = normalizeTags(body.value.tags || []);
        const images = body.value.images;
        if (!title) return json(res, 400, { ok: false, error: "Naziv je obavezan." });
        if (documentUrl === null) return json(res, 400, { ok: false, error: "Link dokumentacije mora početi sa http:// ili https://." });
        if (tags === null) return json(res, 400, { ok: false, error: "Hashtagovi moraju biti niz." });
        if (!Array.isArray(images) || images.length < 1 || images.length > 35) {
          return json(res, 400, { ok: false, error: "Dodaj od 1 do 35 slika." });
        }

        const projectId = randomUUID();
        const projectDir = path.join(BUILDINGSITE_DIR, projectId);
        const originalsDir = path.join(projectDir, "originals");
        const thumbsDir = path.join(projectDir, "thumbs");
        try {
          await mkdir(originalsDir, { recursive: true });
          await mkdir(thumbsDir, { recursive: true });
          const storedImages = [];
          for (let index = 0; index < images.length; index++) {
            const image = images[index] || {};
            const original = decodeUploadedImage(image.data, image.type);
            const thumbnail = decodeUploadedImage(image.thumbnailData, "image/jpeg", 900 * 1024);
            if (!original || !thumbnail) throw new Error(`Slika ${index + 1} nije podržana ili je prevelika.`);
            const imageId = randomUUID();
            const takenAt = normalizeOptionalDate(image.takenAt);
            if (takenAt === null) throw new Error(`Datum slike ${index + 1} nije ispravan.`);
            const ext = IMAGE_TYPES.get(image.type);
            const originalName = `${String(index + 1).padStart(2, "0")}-${imageId}.${ext}`;
            const thumbName = `${String(index + 1).padStart(2, "0")}-${imageId}.jpg`;
            await writeFile(path.join(originalsDir, originalName), original);
            await writeFile(path.join(thumbsDir, thumbName), thumbnail);
            storedImages.push({
              id: imageId,
              name: path.basename(String(image.name || `slika-${index + 1}`)),
              size: original.length,
              original: `/buildingsite-files/${projectId}/originals/${originalName}`,
              thumbnail: `/buildingsite-files/${projectId}/thumbs/${thumbName}`,
              takenAt,
            });
          }
          const buildingSite = addBuildingSite({ id: projectId, title, location, address, documentUrl, label, tags, images: storedImages });
          return json(res, 201, { ok: true, buildingSite });
        } catch (err) {
          await rm(projectDir, { recursive: true, force: true }).catch(() => {});
          return json(res, 400, { ok: false, error: err.message || "Slike nisu sačuvane." });
        }
      }

      const buildingSiteImageMatch = pathname.match(/^\/api\/buildingsites\/([^/]+)\/images\/([^/]+)$/);
      if (buildingSiteImageMatch && method === "PATCH") {
        setBaseHeaders(res);
        const id = decodeURIComponent(buildingSiteImageMatch[1]);
        const imageId = decodeURIComponent(buildingSiteImageMatch[2]);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        const takenAt = normalizeOptionalDate(body.value.takenAt);
        if (takenAt === null) return json(res, 400, { ok: false, error: "Datum fotografije nije ispravan." });
        const buildingSite = updateBuildingSiteImage(id, imageId, { takenAt });
        if (!buildingSite) return json(res, 404, { ok: false, error: "Fotografija nije pronađena." });
        return json(res, 200, { ok: true, buildingSite });
      }

      const buildingSiteHotspotsMatch = pathname.match(/^\/api\/buildingsites\/([^/]+)\/images\/([^/]+)\/hotspots$/);
      if (buildingSiteHotspotsMatch && method === "POST") {
        setBaseHeaders(res);
        const id = decodeURIComponent(buildingSiteHotspotsMatch[1]);
        const imageId = decodeURIComponent(buildingSiteHotspotsMatch[2]);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        const title = String(body.value.title || "").trim().slice(0, 160);
        const x = Number(body.value.x);
        const y = Number(body.value.y);
        const link = normalizeOptionalHttpUrl(body.value.link);
        if (!title || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
          return json(res, 400, { ok: false, error: "Oznaka mora imati naziv i ispravnu poziciju na slici." });
        }
        if (link === null) return json(res, 400, { ok: false, error: "Link oznake mora početi sa http:// ili https://." });
        const result = addBuildingSiteHotspot(id, imageId, { x, y, title, link });
        if (!result) return json(res, 404, { ok: false, error: "Fotografija nije pronađena." });
        return json(res, 201, { ok: true, ...result });
      }

      const buildingSiteHotspotMatch = pathname.match(/^\/api\/buildingsites\/([^/]+)\/images\/([^/]+)\/hotspots\/([^/]+)$/);
      if (buildingSiteHotspotMatch && method === "DELETE") {
        setBaseHeaders(res);
        const id = decodeURIComponent(buildingSiteHotspotMatch[1]);
        const imageId = decodeURIComponent(buildingSiteHotspotMatch[2]);
        const hotspotId = decodeURIComponent(buildingSiteHotspotMatch[3]);
        const buildingSite = removeBuildingSiteHotspot(id, imageId, hotspotId);
        if (!buildingSite) return json(res, 404, { ok: false, error: "Oznaka nije pronađena." });
        return json(res, 200, { ok: true, buildingSite, hotspotId });
      }

      const buildingSiteMatch = pathname.match(/^\/api\/buildingsites\/([^/]+)$/);
      if (buildingSiteMatch) {
        const id = decodeURIComponent(buildingSiteMatch[1]);
        const item = listBuildingSites().find((entry) => entry.id === id);
        if (!item) return json(res, 404, { ok: false, error: "Gradilište nije pronađeno." });
        if (method === "PATCH") {
          setBaseHeaders(res);
          const body = await parseJson(req);
          if (!body.ok) return json(res, 400, body.err);
          if (Object.hasOwn(body.value, "images")) {
            return json(res, 400, { ok: false, error: "Slike i oznake se mijenjaju kroz njihove posebne API rute." });
          }
          const patch = {};
          if (Object.hasOwn(body.value, "title")) patch.title = String(body.value.title || "").trim().slice(0, 160);
          if (Object.hasOwn(body.value, "label")) patch.label = String(body.value.label || "").trim().slice(0, 40);
          if (Object.hasOwn(body.value, "location") || Object.hasOwn(body.value, "sourceUrl")) {
            patch.location = String(body.value.location ?? body.value.sourceUrl ?? "").trim().slice(0, 160);
          }
          if (Object.hasOwn(body.value, "address")) patch.address = String(body.value.address || "").trim().slice(0, 240);
          if (Object.hasOwn(body.value, "documentUrl")) {
            const documentUrl = normalizeOptionalHttpUrl(body.value.documentUrl);
            if (documentUrl === null) return json(res, 400, { ok: false, error: "Link dokumentacije mora početi sa http:// ili https://." });
            patch.documentUrl = documentUrl;
          }
          if (Object.hasOwn(body.value, "tags")) {
            const tags = normalizeTags(body.value.tags);
            if (tags === null) return json(res, 400, { ok: false, error: "Hashtagovi moraju biti niz." });
            patch.tags = tags;
          }
          if (Object.hasOwn(body.value, "featuredImageId")) {
            const featuredImageId = String(body.value.featuredImageId || "").trim();
            if (featuredImageId && !item.images.some((image) => image.id === featuredImageId)) {
              return json(res, 400, { ok: false, error: "Izabrana naslovna fotografija nije u ovom albumu." });
            }
            patch.featuredImageId = featuredImageId;
          }
          const buildingSite = updateBuildingSite(id, patch);
          return json(res, 200, { ok: true, buildingSite });
        }
        if (method === "DELETE") {
          setBaseHeaders(res);
          const projectDir = path.resolve(BUILDINGSITE_DIR, id);
          if (!projectDir.startsWith(BUILDINGSITE_DIR + path.sep)) {
            return json(res, 400, { ok: false, error: "Neispravna putanja." });
          }
          await rm(projectDir, { recursive: true, force: true });
          removeBuildingSite(id);
          return json(res, 200, { ok: true, id });
        }
      }

      const SEED_FILES_DIR = path.resolve(__dirname, "store", "seed_files", "buildingsites");

      const buildingSiteFileMatch = pathname.match(/^\/buildingsite-files\/([^/]+)\/(originals|thumbs)\/([^/]+)$/);
      if (buildingSiteFileMatch && method === "GET") {
        const [, projectId, size, filename] = buildingSiteFileMatch;
        const filePath = path.resolve(BUILDINGSITE_DIR, projectId, size, filename);
        if (!filePath.startsWith(BUILDINGSITE_DIR + path.sep)) return json(res, 400, { ok: false, error: "Neispravna putanja." });
        try {
          let data;
          try {
            data = await readFile(filePath);
          } catch {
            const seedPath = path.resolve(SEED_FILES_DIR, projectId, size, filename);
            data = await readFile(seedPath);
          }
          const type = MIME[path.extname(filename).toLowerCase()] || "application/octet-stream";
          setBaseHeaders(res, { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable" });
          res.writeHead(200);
          res.end(data);
          return;
        } catch {
          return json(res, 404, { ok: false, error: "Slika nije pronađena." });
        }
      }

      // --- Upload fajl (base64 JSON) ---
      if (pathname === "/api/upload" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        const { name, data, type } = body.value;
        if (!name || !data) return json(res, 400, { ok: false, error: "name i data su obavezni." });
        try {
          const uploadsDir = path.resolve(config.DATA_DIR, "uploads");
          await mkdir(uploadsDir, { recursive: true });
          const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
          if (!safeName) {
            return json(res, 400, { ok: false, error: "Invalid filename" });
          }
          const filePath = path.resolve(uploadsDir, safeName);
          if (!filePath.startsWith(uploadsDir + path.sep)) {
            return json(res, 400, { ok: false, error: "Neispravan naziv fajla." });
          }
          const buf = Buffer.from(data, "base64");
          await writeFile(filePath, buf);
          const link = `/uploads/${safeName}`;
          const title = safeName.replace(/\.[^.]+$/, "").replace(/_/g, " ");
          const docBody = type && type.startsWith("text/")
            ? buf.toString("utf8")
            : `<p>Uploaded file: <a href="${link}" target="_blank">${safeName}</a></p>`;
          const doc = addDocument(title, docBody);
          return json(res, 201, { ok: true, document: doc, link });
        } catch (err) {
          return json(res, 500, { ok: false, error: err.message });
        }
      }

      // --- Serviraj upload-ovane fajlove ---
      if (pathname.startsWith("/uploads/") && method === "GET") {
        const relName = decodeURIComponent(pathname.slice(9));
        const safeName = path.basename(relName).replace(/[^a-zA-Z0-9._-]/g, "_");
        const uploadsDir = path.resolve(config.DATA_DIR, "uploads");
        const filePath = path.resolve(uploadsDir, safeName);
        if (!filePath.startsWith(uploadsDir + path.sep)) return json(res, 400, { ok: false, error: "Neispravna putanja." });
        try {
          const data = await readFile(filePath);
          const ext = path.extname(safeName).toLowerCase();
          const mimeMap = { ".txt": "text/plain", ".pdf": "application/pdf", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
          setBaseHeaders(res, { "Content-Type": mimeMap[ext] || "application/octet-stream", "Content-Disposition": `inline; filename="${safeName}"` });
          res.writeHead(200);
          res.end(data);
          return;
        } catch {
          return json(res, 404, { ok: false, error: "Fajl nije pronađen." });
        }
      }

      if (pathname === "/api/todos" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        const { title, day, priority, time, repeat } = body.value;
        if (!title || !day) return json(res, 400, { ok: false, error: "title i day su obavezni." });
        const task = addTask(title, day, priority, false, time, repeat);
        return json(res, 201, { ok: true, todo: task });
      }

      // /api/todos/:id  (PATCH, DELETE)
      const todoMatch = pathname.match(/^\/api\/todos\/([^/]+)$/);
      if (todoMatch) {
        const id = decodeURIComponent(todoMatch[1]);
        if (method === "PATCH") {
          setBaseHeaders(res);
          const body = await parseJson(req);
          if (!body.ok) return json(res, 400, body.err);
          const updated = updateTask(id, body.value);
          if (!updated) return json(res, 404, { ok: false, error: "Task nije pronađen." });
          return json(res, 200, { ok: true, todo: updated });
        }
        if (method === "DELETE") {
          setBaseHeaders(res);
          const removed = removeTask(id);
          if (!removed) return json(res, 404, { ok: false, error: "Task nije pronađen." });
          return json(res, 200, { ok: true, id });
        }
      }

      // --- Calendar events za UI ---
      if (pathname === "/api/calendar" && method === "GET") {
        setBaseHeaders(res);
        const day = url.searchParams.get("day") || "today";
        let iso;
        try {
          iso = resolveIso(day);
        } catch {
          return json(res, 400, {
            ok: false,
            error: "Nevalidan 'day' parametar (dozvoljeno: yesterday, today, tomorrow).",
          });
        }
        try {
          const result = await getCalendarEvents(iso);
          return json(res, 200, {
            ok: true,
            ...result,
            configured: isCalendarConfigured(),
            connected: isCalendarConnected(),
          });
        } catch (err) {
          return json(res, 502, { ok: false, error: err.message, configured: true, connected: true });
        }
      }

      // --- Sistemski metrici (CPU/RAM/Disk) za futer ---
      if (pathname === "/api/system" && method === "GET") {
        setBaseHeaders(res);
        try {
          const stats = await getSystemStats();
          return json(res, 200, { ok: true, ...stats });
        } catch (err) {
          return json(res, 500, { ok: false, error: err.message });
        }
      }

      async function getPathSize(targetPath) {
        try {
          const s = await stat(targetPath);
          if (s.isFile()) return s.size;
          if (s.isDirectory()) {
            let total = 0;
            const entries = await readdir(targetPath, { withFileTypes: true });
            for (const entry of entries) {
              total += await getPathSize(path.join(targetPath, entry.name));
            }
            return total;
          }
        } catch (e) {}
        return 0;
      }

      // --- BACKUP ---
      if (pathname === "/api/backup/info" && method === "GET") {
        setBaseHeaders(res);
        const dataDir = config.DATA_DIR;

        const [
          todosSize,
          notesSize,
          docsJsonSize,
          uploadsSize,
          linksSize,
          sitesJsonSize,
          sitesDirSize,
          inspJsonSize,
          inspDirSize
        ] = await Promise.all([
          getPathSize(path.join(dataDir, "todos.json")),
          getPathSize(path.join(dataDir, "notes.json")),
          getPathSize(path.join(dataDir, "documents.json")),
          getPathSize(path.join(dataDir, "uploads")),
          getPathSize(path.join(dataDir, "links.json")),
          getPathSize(path.join(dataDir, "buildingsites.json")),
          getPathSize(path.join(dataDir, "buildingsites")),
          getPathSize(path.join(dataDir, "inspirations.json")),
          getPathSize(path.join(dataDir, "inspirations"))
        ]);

        const todosCount = listTasks(undefined, { includeDone: true }).length;
        const notesCount = listNotes().length;
        const documentsCount = listDocuments().length;
        const linksCount = listLinks().length;
        const buildingSitesCount = listBuildingSites().length;
        const inspirationsCount = listInspirations().length;

        const documentsSize = docsJsonSize + uploadsSize;
        const buildingSitesSize = sitesJsonSize + sitesDirSize;
        const inspirationsSize = inspJsonSize + inspDirSize;
        const totalSize = todosSize + notesSize + documentsSize + linksSize + buildingSitesSize + inspirationsSize;

        return json(res, 200, {
          ok: true,
          todos: todosCount,
          notes: notesCount,
          documents: documentsCount,
          links: linksCount,
          buildingSites: buildingSitesCount,
          inspirations: inspirationsCount,
          sizes: {
            todos: todosSize,
            notes: notesSize,
            documents: documentsSize,
            links: linksSize,
            buildingSites: buildingSitesSize,
            inspirations: inspirationsSize,
            total: totalSize
          }
        });
      }

      if ((pathname === "/api/backup/download" || pathname === "/api/backup/download-json") && method === "GET") {
        const format = url.searchParams.get("format");
        if (pathname === "/api/backup/download-json" || format === "json") {
          try {
            const todos = listTasks(undefined, { includeDone: true });
            const notes = listNotes();
            const documents = listDocuments();
            const links = listLinks();
            const buildingSites = listBuildingSites();
            const inspirations = listInspirations();
            const backup = {
              version: 1,
              exportedAt: new Date().toISOString(),
              data: { todos, notes, documents, links, buildingSites, inspirations }
            };
            const data = JSON.stringify(backup, null, 2);
            
            setBaseHeaders(res);
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Content-Disposition", 'attachment; filename="noema_backup.json"');
            res.writeHead(200);
            res.end(data);
            return;
          } catch (err) {
            setBaseHeaders(res);
            return json(res, 500, { ok: false, error: err.message });
          }
        }

        try {
          const dataDir = config.DATA_DIR;
          const tmpZipPath = path.join(config.DATA_DIR, `noema_archive_${Date.now()}.zip`);

          const potentialItems = [
            "todos.json",
            "notes.json",
            "documents.json",
            "links.json",
            "buildingsites.json",
            "inspirations.json",
            "uploads",
            "buildingsites",
            "inspirations"
          ];
          const itemsToZip = potentialItems.filter(item => existsSync(path.join(dataDir, item)));

          const execFileAsync = promisify(execFile);
          if (itemsToZip.length > 0) {
            await execFileAsync("zip", ["-r", tmpZipPath, ...itemsToZip], { cwd: dataDir });
          } else {
            await execFileAsync("zip", ["-r", tmpZipPath, "."], { cwd: dataDir });
          }

          const zipBuffer = await readFile(tmpZipPath);
          await rm(tmpZipPath, { force: true });

          const todayStr = new Date().toISOString().split("T")[0];
          setBaseHeaders(res);
          res.setHeader("Content-Type", "application/zip");
          res.setHeader("Content-Disposition", `attachment; filename="noema_archive_${todayStr}.zip"`);
          res.writeHead(200);
          res.end(zipBuffer);
          return;
        } catch (err) {
          setBaseHeaders(res);
          return json(res, 500, { ok: false, error: err.message });
        }
      }

      if (pathname === "/api/backup/upload" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        try {
          const b = body.value;
          let restored = { todos: 0, notes: 0, documents: 0, links: 0, buildingSites: 0, inspirations: 0 };

          if (b.data && Array.isArray(b.data.todos)) {
            replaceTasks(b.data.todos);
            restored.todos = b.data.todos.length;
          }
          if (b.data && Array.isArray(b.data.notes)) {
            replaceNotes(b.data.notes);
            restored.notes = b.data.notes.length;
          }
          if (b.data && Array.isArray(b.data.documents)) {
            replaceDocuments(b.data.documents);
            restored.documents = b.data.documents.length;
          }
          if (b.data && Array.isArray(b.data.links)) {
            replaceLinks(b.data.links);
            restored.links = b.data.links.length;
          }
          if (b.data && Array.isArray(b.data.buildingSites)) {
            replaceBuildingSites(b.data.buildingSites);
            restored.buildingSites = b.data.buildingSites.length;
          }
          if (b.data && Array.isArray(b.data.inspirations)) {
            replaceInspirations(b.data.inspirations);
            restored.inspirations = b.data.inspirations.length;
          }

          return json(res, 200, { ok: true, restored });
        } catch (err) {
          return json(res, 500, { ok: false, error: err.message });
        }
      }

      // --- Status (da UI zna stanje gateway-a) ---
      if (pathname === "/api/backup/snapshot" && method === "POST") {
        setBaseHeaders(res);
        try {
          const todos = listTasks(undefined, { includeDone: true });
          const notes = listNotes();
          const documents = listDocuments();
          const links = listLinks();
          const buildingSites = listBuildingSites();
          const inspirations = listInspirations();
          const backup = {
            version: 2,
            scope: "metadata",
            includesMedia: false,
            exportedAt: new Date().toISOString(),
            data: { todos, notes, documents, links, buildingSites, inspirations }
          };
          const dataPath = path.join(config.DATA_DIR, "snapshots");
          if (!existsSync(dataPath)) {
            await mkdir(dataPath, { recursive: true });
          }
          const ts = Date.now();
          const filename = `snapshot_${ts}.json`;
          await writeFile(path.join(dataPath, filename), JSON.stringify(backup, null, 2));
          return json(res, 200, { ok: true, filename });
        } catch (err) {
          return json(res, 500, { ok: false, error: err.message });
        }
      }

      if (pathname === "/api/backup/snapshots" && method === "GET") {
        setBaseHeaders(res);
        try {
          const dataPath = path.join(config.DATA_DIR, "snapshots");
          if (!existsSync(dataPath)) {
            return json(res, 200, { ok: true, snapshots: [] });
          }
          const files = await readdir(dataPath);
          const snapshots = await Promise.all(
            files
              .filter(f => f.startsWith("snapshot_") && f.endsWith(".json"))
              .map(async f => {
                const tsStr = f.replace("snapshot_", "").replace(".json", "");
                const timestamp = parseInt(tsStr, 10);
                const fileStat = await stat(path.join(dataPath, f)).catch(() => null);
                const size = fileStat ? fileStat.size : 0;
                return { filename: f, timestamp, size };
              })
          );
          snapshots.sort((a, b) => b.timestamp - a.timestamp); // newest first
          return json(res, 200, { ok: true, snapshots });
        } catch (err) {
          return json(res, 500, { ok: false, error: err.message });
        }
      }

      if (pathname === "/api/backup/restore-snapshot" && method === "POST") {
        setBaseHeaders(res);
        const body = await parseJson(req);
        if (!body.ok) return json(res, 400, body.err);
        try {
          const filename = body.value.filename;
          if (!filename || typeof filename !== 'string') {
             return json(res, 400, { ok: false, error: "Invalid filename" });
          }
          const snapshotsDir = path.resolve(config.DATA_DIR, "snapshots");
          const dataPath = path.resolve(snapshotsDir, filename);
          
          if (!dataPath.startsWith(snapshotsDir + path.sep)) {
             return json(res, 400, { ok: false, error: "Invalid path" });
          }
          
          if (!existsSync(dataPath)) {
             return json(res, 404, { ok: false, error: "Snapshot not found" });
          }
          const content = await readFile(dataPath, "utf-8");
          const b = JSON.parse(content);
          
          let restored = { todos: 0, notes: 0, documents: 0, links: 0, buildingSites: 0, inspirations: 0 };
          if (b.data && Array.isArray(b.data.todos)) {
            replaceTasks(b.data.todos);
            restored.todos = b.data.todos.length;
          }
          if (b.data && Array.isArray(b.data.notes)) {
            replaceNotes(b.data.notes);
            restored.notes = b.data.notes.length;
          }
          if (b.data && Array.isArray(b.data.documents)) {
            replaceDocuments(b.data.documents);
            restored.documents = b.data.documents.length;
          }
          if (b.data && Array.isArray(b.data.links)) {
            replaceLinks(b.data.links);
            restored.links = b.data.links.length;
          }
          if (b.data && Array.isArray(b.data.buildingSites)) {
            replaceBuildingSites(b.data.buildingSites);
            restored.buildingSites = b.data.buildingSites.length;
          }
          if (b.data && Array.isArray(b.data.inspirations)) {
            replaceInspirations(b.data.inspirations);
            restored.inspirations = b.data.inspirations.length;
          }

          return json(res, 200, { ok: true, restored });
        } catch (err) {
          return json(res, 500, { ok: false, error: err.message });
        }
      }

      // --- Status (da UI zna stanje gateway-a) ---
      if (pathname === "/api/status" && method === "GET") {
        setBaseHeaders(res);
        return json(res, 200, {
          ok: true,
          authEnabled: config.authEnabled,
          calendarConfigured: isCalendarConfigured(),
          calendarConnected: isCalendarConnected(),
        });
      }

      // --- Live Stats & SEO proxy endpoint ---
      if (pathname === "/api/stats" && method === "GET") {
        setBaseHeaders(res);
        try {
          const days = normalizeStatsDays(url.searchParams.get("days"));
          const includePageSpeed = url.searchParams.get("pagespeed") === "1";
          const stats = await getLiveStats({ days, includePageSpeed });
          return json(res, 200, stats);
        } catch (err) {
          console.error(`[noema] stats error: ${err?.message || err}`);
          return json(res, 502, {
            ok: false,
            live: false,
            status: "unavailable",
            error: "Stats servis trenutno nije dostupan.",
          });
        }
      }

      // --- Zaštićene rute: izlaganje svakog alata kao POST /api/tools/<name> ---
      const toolMatch = pathname.match(/^\/api\/tools\/([a-z][a-z0-9_]*)$/);
      if (toolMatch && method === "POST") {
        return await handleToolRoute(req, res, toolMatch[1]);
      }

      // --- Statički fajlovi (UI) ---
      if (method === "GET") {
        const served = await serveStatic(req, res, pathname);
        if (served) return;
      }

      // 404.
      setBaseHeaders(res);
      const accept = req.headers.accept || "";
      if (accept.includes("text/html")) {
        try {
          const data = localizeHtmlDocument(await readFile(path.join(PUBLIC_DIR, "404.html")));
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
          res.end(data);
          return;
        } catch {
          res.writeHead(302, { Location: "/" });
          return res.end();
        }
      }
      return json(res, 404, {
        ok: false,
        error: "Putanja ne postoji. Vidi / (početna), /openapi.json, /mcp ili /api/todos.",
      });
    } catch (err) {
      console.error("[noema] Greška pri obradi zahteva:", err);
      if (!res.headersSent) {
        setBaseHeaders(res);
        json(res, 500, { ok: false, error: "Interna greška servera." });
      }
    }
  });

  return server;
}

async function handleMcpRoute(req, res) {
  setBaseHeaders(res);
  let body;
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return json(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Neispravan JSON." }, id: null });
  }
  const callerToken = bearerFromHeader(req.headers.authorization);
  const ctx = { baseUrl: config.PUBLIC_BASE_URL, callerToken };
  const result = await handleMcpRequest(body, ctx, registry);
  // Notifikacije (bez id) ne vraćaju odgovor.
  if (result === null) {
    res.writeHead(202);
    return res.end();
  }
  return json(res, 200, result);
}

async function handleToolRoute(req, res, name) {
  setBaseHeaders(res);
  const tool = registry.get(name);
  if (!tool) return json(res, 404, { ok: false, error: `Alat "${name}" ne postoji.` });

  const caller = bearerFromHeader(req.headers.authorization);
  const authError = checkToolAuth(tool, caller);
  if (authError) return json(res, 401, { ok: false, error: authError });

  const body = await parseJson(req);
  if (!body.ok) return json(res, 400, body.err);

  const parsed = validateBySchema(tool.input, body.value);
  if (!parsed.ok) {
    return json(res, 400, { ok: false, error: "Neispravan ulaz.", details: parsed.errors });
  }

  try {
    const ctx = { baseUrl: config.PUBLIC_BASE_URL, callerToken: caller };
    const result = await tool.handler(parsed.value, ctx);
    return json(res, 200, { ok: true, tool: tool.name, result });
  } catch (err) {
    console.error(`[noema] Greška u alatu "${name}":`, err);
    return json(res, 500, { ok: false, error: err.message || "Interna greška alata." });
  }
}

async function parseJson(req, limitBytes) {
  try {
    const raw = await readBody(req, limitBytes);
    if (!raw) return { ok: true, value: {} };
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, err: { ok: false, error: "Neispravan JSON format." } };
  }
}



function localizeHtmlDocument(data) {
  let html = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
  html = html.replace(/<html\b([^>]*)>/i, (_match, attributes) => {
    const clean = attributes.replace(/\s+lang=(["']).*?\1/i, "");
    return `<html${clean} lang="en">`;
  });
  if (!html.includes('/noema-i18n.js')) {
    html = html.replace(/<head\b[^>]*>/i, (head) => `${head}\n  <script src="/noema-i18n.js"></script>`);
  }
  return Buffer.from(html, "utf8");
}

/** Servira statičke fajlove iz public/. Vraca true ako je servirano. */
async function serveStatic(req, res, pathname) {
  // Normalizuj putanju — spreči path traversal. Fajl po default = index.html.
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  if (rel === "/login" || rel === "/login/") rel = "/login.html";
  // Čista URL ruta za arhivu (bez .html ekstenzije).
  if (rel === "/arhiva" || rel === "/arhiva/") rel = "/archive.html";
  // Čista URL ruta za bilješke.
  if (rel === "/notes" || rel === "/notes/") rel = "/notes.html";
  // Čista URL ruta za dokumente.
  if (rel === "/documents" || rel === "/documents/") rel = "/documents.html";
  // Čista URL ruta za linkove (linkdump).
  if (rel === "/links" || rel === "/links/") rel = "/links.html";
  // Čista URL ruta za AI projekte.
  if (rel === "/ai-projects" || rel === "/ai-projects/") rel = "/ai-projects.html";
  // Čista URL ruta za inspiration galeriju.
  if (rel === "/inspiration" || rel === "/inspiration/") rel = "/inspiration.html";
  // Čista URL ruta za building site galeriju.
  if (rel === "/buildingsite" || rel === "/buildingsite/") rel = "/buildingsite.html";
  // Čista URL ruta za backup.
  if (rel === "/backup" || rel === "/backup/") rel = "/backup.html";
  // Čista URL ruta za help.
  if (rel === "/help" || rel === "/help/") rel = "/help.html";
  // Čista URL ruta za stats (SocialDashboard analitika).
  if (rel === "/stats" || rel === "/stats/") rel = "/stats.html";
  // Blokiraj izlazak iz public dir-a.
  const resolvedPublicDir = path.resolve(PUBLIC_DIR);
  const filePath = path.resolve(resolvedPublicDir, "." + rel);
  if (!filePath.startsWith(resolvedPublicDir + path.sep)) {
    return false;
  }

  try {
    let data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".html") data = localizeHtmlDocument(data);
    setBaseHeaders(res, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.writeHead(200, { "Cache-Control": "no-cache" });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}
