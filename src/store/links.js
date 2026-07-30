import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";
import { safeFetchText } from "../core/outbound.js";

/**
 * JSON-file backed storage za linkove (linkdump).
 *
 * Isti obrazac kao `documents.js`: in-memory mapa + debounced persist u
 * `data/links.json`. Svaki link ima url (obavezan), naslov, opis, sliku
 * (og:image), domen i labelu (slobodan tekst — grupa/kategorija).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "links.json");

const links = new Map();
let dirty = false;
let persistTimer = null;

export function loadLinks() {
  mkdirSync(DATA_DIR, { recursive: true });
  links.clear();
  try {
    if (existsSync(DATA_FILE)) {
      const arr = readEncryptedJson(DATA_FILE, []);
      if (Array.isArray(arr)) {
        for (const l of arr) {
          if (!l || typeof l.id !== "string" || typeof l.url !== "string") continue;
          links.set(l.id, l);
        }
      }
    }
  } catch (err) {
    console.error("[noema] Ne mogu da pročitam", DATA_FILE, "— krećem prazno:", err.message);
  }
}

function flushNow() {
  mkdirSync(DATA_DIR, { recursive: true });
  const arr = [...links.values()].sort((a, b) => a.createdAt - b.createdAt);
  writeEncryptedJson(DATA_FILE, arr);
  dirty = false;
}

function schedulePersist() {
  dirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (dirty) flushNow();
  }, 150);
  persistTimer.unref?.();
}

/** Validira i normalizuje URL — dozvoljeni su samo http/https. */
export function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return u.href;
}

/** Nađi postojeći link po URL-u unutar iste kolekcije. */
export function findLinkByUrl(url, collection = "") {
  const normalizedCollection = String(collection).trim().toLowerCase();
  for (const l of links.values()) {
    if (l.url === url && (l.collection || "") === normalizedCollection) return l;
  }
  return null;
}

/**
 * @param {object} fields { url, title?, description?, image?, label?, collection? }
 */
export function addLink(fields) {
  const url = normalizeUrl(fields.url);
  if (!url) return null;
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const link = {
    id: randomUUID(),
    url,
    title: String(fields.title || "").trim() || domain,
    description: String(fields.description || "").trim(),
    image: String(fields.image || "").trim(),
    domain: domain,
    label: String(fields.label || "").trim().toLowerCase(),
    collection: String(fields.collection || "").trim().toLowerCase(),
    pinned: Boolean(fields.pinned) || false,
    archived: Boolean(fields.archived) || false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  links.set(link.id, link);
  schedulePersist();
  return link;
}

export function updateLink(id, patch) {
  const l = links.get(id);
  if (!l) return null;
  const next = { ...l };
  if (typeof patch.title === "string" && patch.title.trim()) {
    next.title = patch.title.trim();
  }
  if (typeof patch.description === "string") {
    next.description = patch.description.trim();
  }
  if (typeof patch.image === "string") {
    next.image = patch.image.trim();
  }
  if (typeof patch.label === "string") {
    next.label = patch.label.trim().toLowerCase();
  }
  if (typeof patch.pinned === "boolean") {
    next.pinned = patch.pinned;
  }
  if (typeof patch.archived === "boolean") {
    next.archived = patch.archived;
  }
  if (typeof patch.collection === "string") {
    next.collection = patch.collection.trim().toLowerCase();
  }
  if (typeof patch.url === "string" && patch.url.trim()) {
    const newUrl = normalizeUrl(patch.url);
    if (newUrl) {
      next.url = newUrl;
      next.domain = new URL(newUrl).hostname.replace(/^www\./, "");
    }
  }
  next.updatedAt = Date.now();
  links.set(id, next);
  schedulePersist();
  return next;
}

export function removeLink(id) {
  const existed = links.delete(id);
  if (existed) schedulePersist();
  return existed;
}

/** Bulk brisanje linkova po ID-jevima. */
export function bulkRemoveLinks(ids) {
  let count = 0;
  for (const id of ids) {
    if (links.delete(id)) count++;
  }
  if (count) schedulePersist();
  return count;
}

/** Bulk arhiviranje/dearhiviranje linkova. */
export function bulkArchiveLinks(ids, archived = true) {
  let count = 0;
  for (const id of ids) {
    const l = links.get(id);
    if (!l) continue;
    l.archived = archived;
    l.updatedAt = Date.now();
    count++;
  }
  if (count) schedulePersist();
  return count;
}

/** Vraća sve linkove, najnoviji prvo. Opcioni filter po labeli, pretraga i status arhive. */
export function listLinks({ label, q, limit, archived, collection } = {}) {
  let arr = [...links.values()].sort((a, b) => b.createdAt - a.createdAt);
  
  if (archived !== undefined) {
    arr = arr.filter((l) => Boolean(l.archived) === Boolean(archived));
  }
  
  if (label) arr = arr.filter((l) => l.label === String(label).trim().toLowerCase());
  if (collection !== undefined) {
    arr = arr.filter((l) => (l.collection || "") === String(collection).trim().toLowerCase());
  }
  if (q) {
    const needle = String(q).trim().toLowerCase();
    arr = arr.filter(
      (l) =>
        l.title.toLowerCase().includes(needle) ||
        l.description.toLowerCase().includes(needle) ||
        l.url.toLowerCase().includes(needle) ||
        l.label.includes(needle),
    );
  }
  if (Number.isFinite(limit) && limit > 0) arr = arr.slice(0, limit);
  return arr;
}

export function closeLinks() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (dirty) flushNow();
}

/**
 * Zamijeni sve linkove (za backup restore).
 * @param {Array} newLinks
 */
export function replaceLinks(newLinks) {
  links.clear();
  if (!Array.isArray(newLinks)) return;
  for (const l of newLinks) {
    if (!l || typeof l.id !== "string" || typeof l.url !== "string") continue;
    links.set(l.id, l);
  }
  flushNow();
}

// ── Open Graph metadata fetch (server-side fallback) ──────────────────────
// Bookmarklet šalje title/image iz živog DOM-a (radi i iza login zida IG/FB);
// ovo je fallback kad stigne SAMO url (npr. iz iOS Shortcut-a ili ručnog unosa).

const OG_TIMEOUT_MS = 6000;
const OG_MAX_BYTES = 512 * 1024; // čitamo najviše 512KB HTML-a — meta tagovi su u <head>

export function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Izvuci content iz <meta property=... content=...> (redoslijed atributa varira). */
function metaContent(html, key) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) return "";
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1] || "";
  return decodeEntities(content.trim());
}

/**
 * Jednostavni lokalni HTML-to-Text ekstrakcioni alat za Reader Mode.
 * Drži se 'zero-dependencies' filozofije i radi solidan posao za članke.
 */
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
    let contentMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (!contentMatch) contentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (!contentMatch) contentMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    let text = contentMatch ? contentMatch[1] : html;
    text = text.replace(/<(script|style|svg|nav|footer|header|aside|button|form|iframe)[^>]*>[\s\S]*?<\/\1>/gi, "");
    text = text.replace(/<\/(p|div|h[1-6]|li|blockquote|br)>/gi, "\n\n");
    text = text.replace(/<br[^>]*>/gi, "\n");
    text = text.replace(/<[^>]+>/g, " ");
    text = decodeEntities(text);
    text = text.replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return text || "Text could not be extracted from this page automatically.";
  } catch (err) {
    return "Unable to download the article: " + err.message;
  }
}

/**
 * Pokuša da povuče OG metapodatke sa stranice. Nikad ne baca — vraća
 * `{ title, description, image }` sa praznim stringovima ako ne uspije
 * (IG/FB često vrate login zid anonimnim klijentima).
 */
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
    const junkTitles = [
      "redirecting", "redirecting...", "just a moment...", "just a moment",
      "log in", "log into facebook", "login", "attention required",
      "please wait", "loading", "loading...", "verify",
    ];
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

/**
 * Centralna logika čuvanja: normalizuj URL, dopuni metapodatke sa servera ako
 * fale, dedupliciraj po URL-u. Koriste je i REST ruta i `link_add` alat.
 * @returns {Promise<{link: object, existed: boolean}>}
 */
export async function createLinkWithMeta(fields) {
  const url = normalizeUrl(fields.url);
  if (!url) throw new Error("Neispravan URL — dozvoljeni su samo http/https linkovi.");

  const collection = String(fields.collection || "").trim().toLowerCase();
  const existing = findLinkByUrl(url, collection);
  if (existing) {
    // Isti link već postoji — osvježi labelu/metapodatke umjesto duplikata.
    const patch = {};
    if (fields.label) patch.label = fields.label;
    if (fields.title && (existing.title === existing.url || existing.title === existing.domain)) patch.title = fields.title;
    if (fields.image && !existing.image) patch.image = fields.image;
    if (fields.description && !existing.description) patch.description = fields.description;
    const link = Object.keys(patch).length ? updateLink(existing.id, patch) : existing;
    return { link, existed: true };
  }

  let { title, description, image, label } = fields;
  if (!title || !image) {
    const meta = await fetchPageMeta(url);
    title = title || meta.title;
    description = description || meta.description;
    image = image || meta.image;
  }
  const link = addLink({ url, title, description, image, label, collection });
  return { link, existed: false };
}
