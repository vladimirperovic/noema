import { randomUUID } from "node:crypto";
import { createCollection } from "./collection.js";

function normalizeInspiration(raw) {
  const item = { ...raw };
  const now = Date.now();
  item.title = String(item.title || "").trim();
  item.sourceUrl = String(item.sourceUrl || "").trim();
  item.address = String(item.address || "").trim();
  item.label = String(item.label || "").trim().toLowerCase();
  item.images = Array.isArray(item.images) ? item.images : [];
  item.createdAt = Number.isFinite(item.createdAt) ? item.createdAt : now;
  item.updatedAt = Number.isFinite(item.updatedAt) ? item.updatedAt : item.createdAt;
  if (typeof item.featuredImageId !== "string" || !item.images.some((image) => image?.id === item.featuredImageId)) {
    delete item.featuredImageId;
  }
  return item;
}

const inspirations = createCollection({
  name: "inspirations",
  legacyFile: "inspirations.json",
  normalize: normalizeInspiration,
  validate: (item) => Boolean(item && typeof item.id === "string" && item.id && typeof item.title === "string"),
});

export function loadInspirations() { inspirations.load(); }

export function addInspiration({ id = randomUUID(), title, sourceUrl = "", address = "", label = "", images = [] }) {
  const now = Date.now();
  return inspirations.set(normalizeInspiration({ id, title, sourceUrl, address, label, images, createdAt: now, updatedAt: now }));
}

export function updateInspiration(id, patch) {
  const item = inspirations.get(id);
  if (!item) return null;
  const next = { ...item };
  if (typeof patch.title === "string" && patch.title.trim()) next.title = patch.title;
  if (typeof patch.sourceUrl === "string") next.sourceUrl = patch.sourceUrl;
  if (typeof patch.address === "string") next.address = patch.address;
  if (typeof patch.label === "string") next.label = patch.label;
  if (Array.isArray(patch.images)) next.images = patch.images;
  if (typeof patch.featuredImageId === "string") next.featuredImageId = patch.featuredImageId;
  next.updatedAt = Date.now();
  return inspirations.set(normalizeInspiration(next));
}

export function removeInspiration(id) { return inspirations.remove(id); }
export function listInspirations() { return inspirations.list().sort((a, b) => b.createdAt - a.createdAt); }
export function replaceInspirations(values) { inspirations.replace(values); }
export function closeInspirations() { inspirations.close(); }
