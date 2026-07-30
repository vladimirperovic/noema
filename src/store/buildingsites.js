import { randomUUID } from "node:crypto";
import { createCollection } from "./collection.js";

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  return tags.map((tag) => String(tag).trim().replace(/^#+/, "")).filter((tag) => {
    const key = tag.toLocaleLowerCase("sr");
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeDate(value) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function normalizeHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeHotspot(hotspot) {
  if (!hotspot || typeof hotspot !== "object") return null;
  const title = String(hotspot.title || "").trim().slice(0, 160);
  const x = Number(hotspot.x);
  const y = Number(hotspot.y);
  if (!title || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: typeof hotspot.id === "string" && hotspot.id ? hotspot.id : randomUUID(),
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
    title,
    link: normalizeHttpUrl(hotspot.link),
  };
}

function normalizeImage(image) {
  const normalized = image && typeof image === "object" ? { ...image } : {};
  normalized.id = typeof normalized.id === "string" && normalized.id ? normalized.id : randomUUID();
  normalized.takenAt = normalizeDate(normalized.takenAt);
  normalized.hotspots = Array.isArray(normalized.hotspots) ? normalized.hotspots.map(normalizeHotspot).filter(Boolean) : [];
  return normalized;
}

function normalizeBuildingSite(raw, { seeded = raw?.seeded === true } = {}) {
  const legacySource = typeof raw?.sourceUrl === "string" ? raw.sourceUrl.trim() : "";
  const legacyIsUrl = /^https?:\/\//i.test(legacySource);
  const location = typeof raw?.location === "string" ? raw.location.trim() : legacyIsUrl ? "" : legacySource;
  const createdAt = Number.isFinite(raw?.createdAt) ? raw.createdAt : Date.now();
  const updatedAt = Number.isFinite(raw?.updatedAt) ? raw.updatedAt : createdAt;
  const item = {
    ...raw,
    id: String(raw.id),
    title: String(raw.title).trim(),
    location,
    address: typeof raw.address === "string" ? raw.address.trim() : "",
    documentUrl: normalizeHttpUrl(typeof raw?.documentUrl === "string" ? raw.documentUrl : legacyIsUrl ? legacySource : ""),
    sourceUrl: location,
    label: typeof raw.label === "string" ? raw.label.trim().toLowerCase() : "",
    tags: normalizeTags(raw.tags),
    images: Array.isArray(raw.images) ? raw.images.map(normalizeImage) : [],
    createdAt,
    updatedAt,
    seeded,
  };
  if (!(typeof raw?.featuredImageId === "string" && item.images.some((image) => image.id === raw.featuredImageId))) delete item.featuredImageId;
  if (!Number.isFinite(raw?.deletedAt)) delete item.deletedAt;
  return item;
}

const buildingSites = createCollection({
  name: "buildingsites",
  legacyFile: "buildingsites.json",
  normalize: normalizeBuildingSite,
  validate: (item) => Boolean(item && typeof item.id === "string" && item.id && typeof item.title === "string"),
});

export function loadBuildingSites() { buildingSites.load(); }

export function addBuildingSite({
  id = randomUUID(), title, location = "", address = "", documentUrl = "", sourceUrl = "", label = "", tags = [], images = [],
}) {
  const now = Date.now();
  return buildingSites.set(normalizeBuildingSite({
    id, title, location: location || sourceUrl, address, documentUrl, label, tags, images,
    createdAt: now, updatedAt: now, seeded: false,
  }));
}

export function updateBuildingSite(id, patch) {
  const item = buildingSites.get(id);
  if (!item || Number.isFinite(item.deletedAt)) return null;
  const next = { ...item };
  if (typeof patch.title === "string" && patch.title.trim()) next.title = patch.title.trim();
  if (typeof patch.location === "string") {
    next.location = patch.location.trim();
    next.sourceUrl = next.location;
  } else if (typeof patch.sourceUrl === "string") {
    next.location = patch.sourceUrl.trim();
    next.sourceUrl = next.location;
  }
  if (typeof patch.address === "string") next.address = patch.address.trim();
  if (typeof patch.documentUrl === "string") next.documentUrl = normalizeHttpUrl(patch.documentUrl);
  if (typeof patch.label === "string") next.label = patch.label.trim().toLowerCase();
  if (Array.isArray(patch.tags)) next.tags = normalizeTags(patch.tags);
  if (typeof patch.featuredImageId === "string") next.featuredImageId = patch.featuredImageId;
  next.updatedAt = Date.now();
  return buildingSites.set(normalizeBuildingSite(next));
}

export function updateBuildingSiteImage(id, imageId, patch) {
  const item = buildingSites.get(id);
  if (!item || Number.isFinite(item.deletedAt)) return null;
  const imageIndex = item.images.findIndex((image) => image.id === imageId);
  if (imageIndex < 0) return null;
  const next = { ...item, images: [...item.images], updatedAt: Date.now() };
  const image = { ...next.images[imageIndex] };
  if (Object.hasOwn(patch, "takenAt")) image.takenAt = normalizeDate(patch.takenAt);
  next.images[imageIndex] = normalizeImage(image);
  return buildingSites.set(next);
}

export function addBuildingSiteHotspot(id, imageId, hotspot) {
  const item = buildingSites.get(id);
  if (!item || Number.isFinite(item.deletedAt)) return null;
  const imageIndex = item.images.findIndex((image) => image.id === imageId);
  if (imageIndex < 0) return null;
  const normalizedHotspot = normalizeHotspot({ ...hotspot, id: hotspot.id || randomUUID() });
  if (!normalizedHotspot) return null;
  const next = { ...item, images: [...item.images], updatedAt: Date.now() };
  next.images[imageIndex] = { ...next.images[imageIndex], hotspots: [...next.images[imageIndex].hotspots, normalizedHotspot] };
  return { buildingSite: buildingSites.set(next), hotspot: normalizedHotspot };
}

export function removeBuildingSiteHotspot(id, imageId, hotspotId) {
  const item = buildingSites.get(id);
  if (!item || Number.isFinite(item.deletedAt)) return null;
  const imageIndex = item.images.findIndex((image) => image.id === imageId);
  if (imageIndex < 0) return null;
  const image = item.images[imageIndex];
  const hotspots = image.hotspots.filter((hotspot) => hotspot.id !== hotspotId);
  if (hotspots.length === image.hotspots.length) return null;
  const next = { ...item, images: [...item.images], updatedAt: Date.now() };
  next.images[imageIndex] = { ...image, hotspots };
  return buildingSites.set(next);
}

export function removeBuildingSite(id) {
  const item = buildingSites.get(id);
  if (!item || Number.isFinite(item.deletedAt)) return false;
  if (item.seeded) buildingSites.set({ ...item, deletedAt: Date.now(), updatedAt: Date.now() });
  else buildingSites.remove(id);
  return true;
}

export function listBuildingSites() {
  return buildingSites.list().filter((item) => !Number.isFinite(item.deletedAt)).sort((a, b) => b.createdAt - a.createdAt);
}

export function replaceBuildingSites(values) { buildingSites.replace(values); }
export function closeBuildingSites() { buildingSites.close(); }
