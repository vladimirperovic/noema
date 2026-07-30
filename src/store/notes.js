import { randomUUID } from "node:crypto";
import { createCollection } from "./collection.js";

function normalizeNote(raw) {
  const note = { ...raw };
  const now = Date.now();
  if (Array.isArray(note.items) && note.items.length && !note.body) {
    note.body = note.items.map((item) => `- [${item.completed ? "x" : " "}] ${item.text}`).join("\n");
    delete note.items;
  }
  note.title = String(note.title || "").trim() || "Untitled";
  note.body = String(note.body || "");
  note.labels = Array.isArray(note.labels) ? note.labels : [];
  note.pinned = Boolean(note.pinned);
  note.archived = Boolean(note.archived);
  note.createdAt = Number.isFinite(note.createdAt) ? note.createdAt : now;
  note.updatedAt = Number.isFinite(note.updatedAt) ? note.updatedAt : note.createdAt;
  return note;
}

const notes = createCollection({
  name: "notes",
  legacyFile: "notes.json",
  normalize: normalizeNote,
  validate: (note) => Boolean(note && typeof note.id === "string" && note.id),
});

export function loadNotes() { notes.load(); }

export function addNote(title, body = "", labels = [], pinned = false, archived = false) {
  const now = Date.now();
  return notes.set(normalizeNote({ id: randomUUID(), title, body, labels, pinned, archived, createdAt: now, updatedAt: now }));
}

export function updateNote(id, patch) {
  const note = notes.get(id);
  if (!note) return null;
  const next = { ...note };
  if (typeof patch.title === "string") next.title = patch.title;
  if (typeof patch.body === "string") next.body = patch.body;
  if (Array.isArray(patch.labels)) next.labels = patch.labels;
  if (typeof patch.pinned === "boolean") next.pinned = patch.pinned;
  if (typeof patch.archived === "boolean") next.archived = patch.archived;
  next.updatedAt = Date.now();
  return notes.set(normalizeNote(next));
}

export function removeNote(id) { return notes.remove(id); }
export function listNotes() { return notes.list().sort((a, b) => b.createdAt - a.createdAt); }
export function replaceNotes(values) { notes.replace(values); }
export function closeNotes() { notes.close(); }
