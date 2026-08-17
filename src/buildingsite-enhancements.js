import { randomUUID } from "node:crypto";
import { readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { listBuildingSites, replaceBuildingSites } from "./store/buildingsites.js";
import { writePrivateAssetBuffer } from "./store/private-assets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const BUILDINGSITE_DIR = path.join(config.DATA_DIR, "buildingsites");
const MAX_BODY = 220 * 1024 * 1024;
const MAX_FILE = 25 * 1024 * 1024;
const MAX_BATCH = 60;
const TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/gif", "gif"]]);

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
  res.end(payload);
}

export function sanitizeNote(value) { return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, 2000); }
export function normalizeOrder(order, images) {
  if (!Array.isArray(order) || !Array.isArray(images) || order.length !== images.length) return null;
  const current = new Set(images.map((image) => image.id));
  if (new Set(order).size !== order.length || order.some((id) => !current.has(id))) return null;
  const byId = new Map(images.map((image) => [image.id, image]));
  return order.map((id) => byId.get(id));
}

async function parseJson(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error("Zahtjev je prevelik."); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw new Error("JSON nije ispravan."); }
}
function decodeBase64(data, type, maxBytes = MAX_FILE) {
  if (!TYPES.has(type) || typeof data !== "string" || !/^[a-zA-Z0-9+/]+={0,2}$/.test(data)) return null;
  const buffer = Buffer.from(data, "base64"); return buffer.length && buffer.length <= maxBytes ? buffer : null;
}
function safePart(value) { return path.basename(String(value || "file")).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120); }
function siteById(id) { return listBuildingSites().find((item) => item.id === id) || null; }
function replaceSite(nextSite) { const all = listBuildingSites(); replaceBuildingSites(all.map((item) => item.id === nextSite.id ? nextSite : item)); return nextSite; }

async function addImages(site, images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > MAX_BATCH) throw new Error(`Dodaj od 1 do ${MAX_BATCH} fotografija.`);
  const originalsDir = path.join(BUILDINGSITE_DIR, site.id, "originals"); const thumbsDir = path.join(BUILDINGSITE_DIR, site.id, "thumbs");
  await mkdir(originalsDir, { recursive: true, mode: 0o700 }); await mkdir(thumbsDir, { recursive: true, mode: 0o700 });
  const stored = [];
  try {
    for (let index = 0; index < images.length; index += 1) {
      const input = images[index] || {}; const original = decodeBase64(input.data, input.type); const thumbnail = decodeBase64(input.thumbnailData, "image/jpeg", 1_200_000);
      if (!original || !thumbnail) throw new Error(`Fotografija ${index + 1} nije podržana ili je prevelika.`);
      const imageId = randomUUID(); const ext = TYPES.get(input.type); const prefix = String((site.images?.length || 0) + index + 1).padStart(4, "0");
      const originalName = `${prefix}-${imageId}.${ext}`; const thumbName = `${prefix}-${imageId}.jpg`;
      await writePrivateAssetBuffer(path.join(originalsDir, originalName), original); await writePrivateAssetBuffer(path.join(thumbsDir, thumbName), thumbnail);
      const takenAt = Number.isFinite(Date.parse(input.takenAt || "")) ? new Date(input.takenAt).toISOString() : "";
      stored.push({ id: imageId, name: safePart(input.name), size: original.length, original: `/buildingsite-files/${site.id}/originals/${originalName}`, thumbnail: `/buildingsite-files/${site.id}/thumbs/${thumbName}`, takenAt, note: sanitizeNote(input.note), hotspots: [] });
    }
  } catch (error) {
    await Promise.all(stored.flatMap((image) => [rm(path.join(BUILDINGSITE_DIR, site.id, image.original.replace(/^.*\/originals\//, "originals/")), { force: true }), rm(path.join(BUILDINGSITE_DIR, site.id, image.thumbnail.replace(/^.*\/thumbs\//, "thumbs/")), { force: true })])).catch(() => {});
    throw error;
  }
  return replaceSite({ ...site, images: [...(site.images || []), ...stored], updatedAt: Date.now() });
}

async function deleteImage(site, imageId) {
  const image = site.images?.find((entry) => entry.id === imageId); if (!image) return null;
  const next = { ...site, images: site.images.filter((entry) => entry.id !== imageId), updatedAt: Date.now() }; if (next.featuredImageId === imageId) delete next.featuredImageId;
  const originalName = path.basename(String(image.original || "")); const thumbName = path.basename(String(image.thumbnail || ""));
  await Promise.all([originalName ? rm(path.join(BUILDINGSITE_DIR, site.id, "originals", originalName), { force: true }) : null, thumbName ? rm(path.join(BUILDINGSITE_DIR, site.id, "thumbs", thumbName), { force: true }) : null].filter(Boolean));
  return replaceSite(next);
}

async function handleApi(req, res, pathname) {
  if (!req.noemaPrivileged) { json(res, 401, { ok: false, error: "Prijavite se da biste mijenjali album." }); return true; }
  const addMatch = pathname.match(/^\/api\/buildingsites\/([^/]+)\/images\/add$/);
  if (addMatch && req.method === "POST") { const site = siteById(decodeURIComponent(addMatch[1])); if (!site) return json(res, 404, { ok: false, error: "Album nije pronađen." }), true; try { const body = await parseJson(req); json(res, 201, { ok: true, buildingSite: await addImages(site, body.images) }); } catch (error) { json(res, 400, { ok: false, error: error.message }); } return true; }
  const orderMatch = pathname.match(/^\/api\/buildingsites\/([^/]+)\/images\/order$/);
  if (orderMatch && req.method === "PATCH") { const site = siteById(decodeURIComponent(orderMatch[1])); if (!site) return json(res, 404, { ok: false, error: "Album nije pronađen." }), true; try { const body = await parseJson(req); const images = normalizeOrder(body.order, site.images || []); if (!images) throw new Error("Redosljed fotografija nije ispravan."); json(res, 200, { ok: true, buildingSite: replaceSite({ ...site, images, updatedAt: Date.now() }) }); } catch (error) { json(res, 400, { ok: false, error: error.message }); } return true; }
  const noteMatch = pathname.match(/^\/api\/buildingsites\/([^/]+)\/images\/([^/]+)\/note$/);
  if (noteMatch && req.method === "PATCH") { const site = siteById(decodeURIComponent(noteMatch[1])); const imageId = decodeURIComponent(noteMatch[2]); if (!site) return json(res, 404, { ok: false, error: "Album nije pronađen." }), true; const imageIndex = site.images?.findIndex((image) => image.id === imageId) ?? -1; if (imageIndex < 0) return json(res, 404, { ok: false, error: "Fotografija nije pronađena." }), true; try { const body = await parseJson(req); const images = [...site.images]; images[imageIndex] = { ...images[imageIndex], note: sanitizeNote(body.note) }; json(res, 200, { ok: true, buildingSite: replaceSite({ ...site, images, updatedAt: Date.now() }) }); } catch (error) { json(res, 400, { ok: false, error: error.message }); } return true; }
  const deleteMatch = pathname.match(/^\/api\/buildingsites\/([^/]+)\/images\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") { const site = siteById(decodeURIComponent(deleteMatch[1])); if (!site) return json(res, 404, { ok: false, error: "Album nije pronađen." }), true; const buildingSite = await deleteImage(site, decodeURIComponent(deleteMatch[2])); if (!buildingSite) return json(res, 404, { ok: false, error: "Fotografija nije pronađena." }), true; json(res, 200, { ok: true, buildingSite }); return true; }
  return false;
}

async function handleEnhancementRequest(req, res) {
  const url = new URL(req.url, config.PUBLIC_BASE_URL);
  if (url.pathname === "/buildingsite-enhancements.js" && req.method === "GET") { const source = await readFile(path.join(PUBLIC_DIR, "buildingsite-enhancements.js")); res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" }); res.end(source); return true; }
  if (url.pathname === "/inspiration-global-modes.js" && req.method === "GET") { const source = await readFile(path.join(PUBLIC_DIR, "inspiration-global-modes.js")); res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" }); res.end(source); return true; }
  if (url.pathname === "/noema-header-footer.js" && req.method === "GET") {
    const source = await readFile(path.join(PUBLIC_DIR, "noema-header-footer.js"), "utf8");
    const loader = "\n;if(['/buildingsite','/buildingsite/','/buildingsite.html'].includes(location.pathname)){import('/buildingsite-enhancements.js').catch(console.error);}\n;if(['/inspiration','/inspiration/','/inspiration.html'].includes(location.pathname)){import('/inspiration-global-modes.js').catch(console.error);}\n";
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" }); res.end(source + loader); return true;
  }
  if (url.pathname.startsWith("/api/buildingsites/") && url.pathname.includes("/images/")) return handleApi(req, res, url.pathname);
  return false;
}

export function installBuildingSiteEnhancements(server) {
  const original = server.listeners("request")[0]; if (!original) throw new Error("Noema request handler nije pronađen.");
  server.removeAllListeners("request"); server.on("request", async (req, res) => { try { if (await handleEnhancementRequest(req, res)) return; return original(req, res); } catch (error) { if (!res.headersSent) json(res, 500, { ok: false, error: error.message || "Greška servera." }); else res.destroy(error); } }); return server;
}
