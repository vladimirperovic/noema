import { randomUUID } from "node:crypto";
import { safeFetchText } from "../core/outbound.js";
import { createCollection } from "./collection.js";

function normalizeLink(raw) {
  const link = { ...raw };
  const now = Date.now();
  link.url = String(link.url || "");
  link.title = String(link.title || "").trim();
  link.description = String(link.description || "").trim();
  link.image = String(link.image || "").trim();
  link.domain = String(link.domain || "").trim();
  link.label = String(link.label || "").trim().toLowerCase();
  link.collection = String(link.collection || "").trim().toLowerCase();
  link.pinned = Boolean(link.pinned);
  link.archived = Boolean(link.archived);
  link.createdAt = Number.isFinite(link.createdAt) ? link.createdAt : now;
  link.updatedAt = Number.isFinite(link.updatedAt) ? link.updatedAt : link.createdAt;
  return link;
}

const links = createCollection({
  name: "links",
  legacyFile: "links.json",
  normalize: normalizeLink,
  validate: (link) => Boolean(link && typeof link.id === "string" && link.id && typeof link.url === "string" && link.url),
});

export function loadLinks() { links.load(); }

export function normalizeUrl(raw) {
  try {
    const url = new URL(String(raw).trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function findLinkByUrl(url, collection = "") {
  const normalizedCollection = String(collection).trim().toLowerCase();
  return links.list().find((link) => link.url === url && (link.collection || "") === normalizedCollection) || null;
}

export function addLink(fields) {
  const url = normalizeUrl(fields.url);
  if (!url) return null;
  const now = Date.now();
  const domain = new URL(url).hostname.replace(/^www\./, "");
  return links.set(normalizeLink({
    id: randomUUID(),
    url,
    title: String(fields.title || "").trim() || domain,
    description: fields.description,
    image: fields.image,
    domain,
    label: fields.label,
    collection: fields.collection,
    pinned: fields.pinned,
    archived: fields.archived,
    createdAt: now,
    updatedAt: now,
  }));
}

export function updateLink(id, patch) {
  const link = links.get(id);
  if (!link) return null;
  const next = { ...link };
  if (typeof patch.title === "string" && patch.title.trim()) next.title = patch.title;
  if (typeof patch.description === "string") next.description = patch.description;
  if (typeof patch.image === "string") next.image = patch.image;
  if (typeof patch.label === "string") next.label = patch.label;
  if (typeof patch.pinned === "boolean") next.pinned = patch.pinned;
  if (typeof patch.archived === "boolean") next.archived = patch.archived;
  if (typeof patch.collection === "string") next.collection = patch.collection;
  if (typeof patch.url === "string" && patch.url.trim()) {
    const url = normalizeUrl(patch.url);
    if (url) {
      next.url = url;
      next.domain = new URL(url).hostname.replace(/^www\./, "");
    }
  }
  next.updatedAt = Date.now();
  return links.set(normalizeLink(next));
}

export function removeLink(id) { return links.remove(id); }

export function bulkRemoveLinks(ids) {
  let count = 0;
  for (const id of ids) if (links.remove(id)) count++;
  return count;
}

export function bulkArchiveLinks(ids, archived = true) {
  let count = 0;
  for (const id of ids) {
    const link = links.get(id);
    if (!link) continue;
    links.set({ ...link, archived: Boolean(archived), updatedAt: Date.now() });
    count++;
  }
  return count;
}

export function listLinks({ label, q, limit, archived, collection } = {}) {
  let result = links.list().sort((a, b) => b.createdAt - a.createdAt);
  if (archived !== undefined) result = result.filter((link) => link.archived === Boolean(archived));
  if (label) result = result.filter((link) => link.label === String(label).trim().toLowerCase());
  if (collection !== undefined) result = result.filter((link) => link.collection === String(collection).trim().toLowerCase());
  if (q) {
    const needle = String(q).trim().toLowerCase();
    result = result.filter((link) => [link.title, link.description, link.url, link.label].some((value) => value.toLowerCase().includes(needle)));
  }
  if (Number.isFinite(limit) && limit > 0) result = result.slice(0, limit);
  return result;
}

export function closeLinks() { links.close(); }
export function replaceLinks(values) { links.replace(values); }

const OG_TIMEOUT_MS = 6000;
const OG_MAX_BYTES = 512 * 1024;

export function decodeEntities(value) {
  if (!value) return "";
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
}

function metaContent(html, key) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i"))?.[0];
  if (!tag) return "";
  return decodeEntities((tag.match(/content=["']([^"']*)["']/i)?.[1] || "").trim());
}

export async function fetchArticleText(url) {
  const safe = normalizeUrl(url);
  if (!safe) return "Invalid URL.";
  try {
    const response = await safeFetchText(safe, {
      timeoutMs: 8000,
      maxBytes: 1024 * 1024,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Noema/0.1; self-hosted)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
      },
    });
    const type = String(response.headers["content-type"] || "").toLowerCase();
    if (!response.ok) throw new Error("Remote server returned HTTP " + response.status + ".");
    if (type && !type.includes("html") && !type.includes("text/plain")) throw new Error("The URL did not return readable text or HTML.");
    const html = response.text;
    const content = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
      || html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let text = content ? content[1] : html;
    text = text.replace(/<(script|style|svg|nav|footer|header|aside|button|form|iframe)[^>]*>[\s\S]*?<\/\1>/gi, "");
    text = text.replace(/<\/(p|div|h[1-6]|li|blockquote|br)>/gi, "\n\n").replace(/<br[^>]*>/gi, "\n");
    text = decodeEntities(text.replace(/<[^>]+>/g, " "));
    text = text.replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return text || "Text could not be extracted from this page automatically.";
  } catch (error) {
    return "Unable to download the article: " + error.message;
  }
}

export async function fetchPageMeta(url) {
  const empty = { title: "", description: "", image: "" };
  const safe = normalizeUrl(url);
  if (!safe) return empty;
  try {
    const response = await safeFetchText(safe, {
      timeoutMs: OG_TIMEOUT_MS,
      maxBytes: OG_MAX_BYTES,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Noema/0.1; self-hosted)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const type = String(response.headers["content-type"] || "").toLowerCase();
    if (!response.ok || !type.includes("html")) return empty;
    const html = response.text;
    let title = metaContent(html, "og:title") || decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim());
    const junkTitles = ["redirecting", "redirecting...", "just a moment...", "just a moment", "log in", "log into facebook", "login", "attention required", "please wait", "loading", "loading...", "verify"];
    if (title && junkTitles.includes(title.toLowerCase().replace(/[.\u2026]+$/, "").trim())) title = "";
    const description = metaContent(html, "og:description") || metaContent(html, "description");
    let image = metaContent(html, "og:image") || metaContent(html, "twitter:image");
    if (image && !/^https?:\/\//i.test(image)) {
      try { image = new URL(image, response.url).href; } catch { image = ""; }
    }
    return { title, description, image };
  } catch {
    return empty;
  }
}

export async function createLinkWithMeta(fields) {
  const url = normalizeUrl(fields.url);
  if (!url) throw new Error("Neispravan URL — dozvoljeni su samo http/https linkovi.");
  const collection = String(fields.collection || "").trim().toLowerCase();
  const existing = findLinkByUrl(url, collection);
  if (existing) {
    const patch = {};
    if (fields.label) patch.label = fields.label;
    if (fields.title && (existing.title === existing.url || existing.title === existing.domain)) patch.title = fields.title;
    if (fields.image && !existing.image) patch.image = fields.image;
    if (fields.description && !existing.description) patch.description = fields.description;
    return { link: Object.keys(patch).length ? updateLink(existing.id, patch) : existing, existed: true };
  }
  let { title, description, image, label } = fields;
  if (!title || !image) {
    const meta = await fetchPageMeta(url);
    title ||= meta.title;
    description ||= meta.description;
    image ||= meta.image;
  }
  return { link: addLink({ url, title, description, image, label, collection }), existed: false };
}
