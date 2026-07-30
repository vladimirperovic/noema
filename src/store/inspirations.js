import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";

const DATA_DIR = config.DATA_DIR;
const DATA_FILE = path.join(DATA_DIR, "inspirations.json");

const inspirations = new Map();
let dirty = false;
let persistTimer = null;

export function loadInspirations() {
  mkdirSync(DATA_DIR, { recursive: true });
  inspirations.clear();
  try {
    if (!existsSync(DATA_FILE)) return;
    const items = readEncryptedJson(DATA_FILE, []);
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item.id !== "string" || typeof item.title !== "string") continue;
      item.images = Array.isArray(item.images) ? item.images : [];
      item.label = typeof item.label === "string" ? item.label : "";
      item.address = typeof item.address === "string" ? item.address : "";
      inspirations.set(item.id, item);
    }
  } catch (err) {
    console.error("[noema] Ne mogu da pročitam", DATA_FILE, ":", err.message);
  }
}

function flushNow() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeEncryptedJson(DATA_FILE, [...inspirations.values()].sort((a, b) => a.createdAt - b.createdAt));
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

export function addInspiration({ id = randomUUID(), title, sourceUrl = "", address = "", label = "", images = [] }) {
  const now = Date.now();
  const item = {
    id,
    title: String(title).trim(),
    sourceUrl: String(sourceUrl || "").trim(),
    address: String(address || "").trim(),
    label: String(label || "").trim().toLowerCase(),
    images,
    createdAt: now,
    updatedAt: now,
  };
  inspirations.set(id, item);
  schedulePersist();
  return item;
}

export function updateInspiration(id, patch) {
  const item = inspirations.get(id);
  if (!item) return null;
  const next = { ...item };
  if (typeof patch.title === "string" && patch.title.trim()) next.title = patch.title.trim();
  if (typeof patch.sourceUrl === "string") next.sourceUrl = patch.sourceUrl.trim();
  if (typeof patch.address === "string") next.address = patch.address.trim();
  if (typeof patch.label === "string") next.label = patch.label.trim().toLowerCase();
  if (typeof patch.featuredImageId === "string") next.featuredImageId = patch.featuredImageId;
  next.updatedAt = Date.now();
  inspirations.set(id, next);
  schedulePersist();
  return next;
}

export function removeInspiration(id) {
  const existed = inspirations.delete(id);
  if (existed) schedulePersist();
  return existed;
}

export function listInspirations() {
  return [...inspirations.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function replaceInspirations(newList) {
  inspirations.clear();
  for (const item of newList) {
    if (item && item.id) inspirations.set(item.id, item);
  }
  schedulePersist();
}

export function closeInspirations() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (dirty) flushNow();
}
