import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";

/**
 * JSON-file backed storage za dokumente.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "documents.json");

const documents = new Map();
let dirty = false;
let persistTimer = null;

export function loadDocuments() {
  mkdirSync(DATA_DIR, { recursive: true });
  documents.clear();
  try {
    if (existsSync(DATA_FILE)) {
      const arr = readEncryptedJson(DATA_FILE, []);
      if (Array.isArray(arr)) {
        for (const d of arr) {
          if (!d || typeof d.id !== "string") continue;
          if (!d.body) d.body = "";
          documents.set(d.id, d);
        }
      }
    }
  } catch (err) {
    console.error("[noema] Ne mogu da pročitam", DATA_FILE, "— krećem prazno:", err.message);
  }
}

function flushNow() {
  mkdirSync(DATA_DIR, { recursive: true });
  const arr = [...documents.values()].sort((a, b) => a.createdAt - b.createdAt);
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

export function addDocument(title, body = "", label = "") {
  const doc = {
    id: randomUUID(),
    title: String(title).trim(),
    body: String(body),
    label: String(label),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  documents.set(doc.id, doc);
  schedulePersist();
  return doc;
}

export function updateDocument(id, patch) {
  const d = documents.get(id);
  if (!d) return null;
  const next = { ...d };
  if (typeof patch.title === "string" && patch.title.trim()) {
    next.title = patch.title.trim();
  }
  if (typeof patch.body === "string") {
    next.body = patch.body;
  }
  if (typeof patch.label === "string") {
    next.label = patch.label;
  }
  next.updatedAt = Date.now();
  documents.set(id, next);
  schedulePersist();
  return next;
}

export function removeDocument(id) {
  const existed = documents.delete(id);
  if (existed) schedulePersist();
  return existed;
}

export function listDocuments() {
  return [...documents.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function closeDocuments() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (dirty) flushNow();
}

/**
 * Zamijeni sve dokumente (za backup restore).
 * @param {Array} newDocuments
 */
export function replaceDocuments(newDocuments) {
  documents.clear();
  if (!Array.isArray(newDocuments)) return;
  for (const d of newDocuments) {
    if (!d || typeof d.id !== "string") continue;
    if (!d.body) d.body = "";
    documents.set(d.id, d);
  }
  flushNow();
}
