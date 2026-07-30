import { randomUUID } from "node:crypto";
import { createCollection } from "./collection.js";

function normalizeDocument(raw) {
  const document = { ...raw };
  const now = Date.now();
  document.title = String(document.title || "").trim();
  document.body = String(document.body || "");
  document.label = String(document.label || "");
  document.createdAt = Number.isFinite(document.createdAt) ? document.createdAt : now;
  document.updatedAt = Number.isFinite(document.updatedAt) ? document.updatedAt : document.createdAt;
  return document;
}

const documents = createCollection({
  name: "documents",
  legacyFile: "documents.json",
  normalize: normalizeDocument,
  validate: (document) => Boolean(document && typeof document.id === "string" && document.id),
});

export function loadDocuments() { documents.load(); }

export function addDocument(title, body = "", label = "") {
  const now = Date.now();
  return documents.set(normalizeDocument({ id: randomUUID(), title, body, label, createdAt: now, updatedAt: now }));
}

export function updateDocument(id, patch) {
  const document = documents.get(id);
  if (!document) return null;
  const next = { ...document };
  if (typeof patch.title === "string" && patch.title.trim()) next.title = patch.title;
  if (typeof patch.body === "string") next.body = patch.body;
  if (typeof patch.label === "string") next.label = patch.label;
  next.updatedAt = Date.now();
  return documents.set(normalizeDocument(next));
}

export function removeDocument(id) { return documents.remove(id); }
export function listDocuments() { return documents.list().sort((a, b) => b.createdAt - a.createdAt); }
export function replaceDocuments(values) { documents.replace(values); }
export function closeDocuments() { documents.close(); }
