import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";

/**
 * JSON-file backed storage za bilješke (notes).
 *
 * Isti obrazac kao `todos.js`: in-memory mapa + debounced persist u
 * `data/notes.json`. Svaka bilješka ima naslov i tekst (body); naslov je
 * obavezan, tekst je opcioni. Lako se kasnije migrira u pravu bazu.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "notes.json");

/** @type {Map<string, object>} id -> raw note */
const notes = new Map();
let dirty = false;
let persistTimer = null;

/** Učitaj postojeće bilješke sa diska u memoriju. Poziva se jednom na startu. */
export function loadNotes() {
  mkdirSync(DATA_DIR, { recursive: true });
  notes.clear();
  try {
    if (existsSync(DATA_FILE)) {
      const arr = readEncryptedJson(DATA_FILE, []);
      if (Array.isArray(arr)) {
        for (const n of arr) {
          if (!n || typeof n.id !== "string") continue;
          // Migracija sa starog (items) na novi (body) sistem
          if (n.items && Array.isArray(n.items) && n.items.length > 0 && !n.body) {
            n.body = n.items.map(it => `- [${it.completed ? 'x' : ' '}] ${it.text}`).join("\n");
            delete n.items;
          }
          if (n.body === undefined) n.body = "";
          n.labels = Array.isArray(n.labels) ? n.labels : [];
          n.pinned = Boolean(n.pinned) || false;
          n.archived = Boolean(n.archived) || false;
          
          notes.set(n.id, n);
        }
      }
    }
  } catch (err) {
    console.error("[noema] Ne mogu da pročitam", DATA_FILE, "— krećem prazno:", err.message);
  }
}

/** Odmah zapiši na disk (sinhrono, jednostavno za MVP). */
function flushNow() {
  mkdirSync(DATA_DIR, { recursive: true });
  const arr = [...notes.values()].sort((a, b) => a.createdAt - b.createdAt);
  writeEncryptedJson(DATA_FILE, arr);
  dirty = false;
}

/** Debounced persist — skuplja brze uzastopne promene u jedan upis. */
function schedulePersist() {
  dirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (dirty) flushNow();
  }, 150);
  persistTimer.unref?.();
}

/**
 * @param {string} title obavezan naslov
 * @param {string} [body=""] markdown sadržaj
 * @param {string[]} [labels=[]] tagovi
 * @param {boolean} [pinned=false]
 * @param {boolean} [archived=false]
 */
export function addNote(title, body = "", labels = [], pinned = false, archived = false) {
  const note = {
    id: randomUUID(),
    title: String(title).trim() || "Untitled",
    body: String(body),
    labels: Array.isArray(labels) ? labels : [],
    pinned: Boolean(pinned),
    archived: Boolean(archived),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  notes.set(note.id, note);
  schedulePersist();
  return note;
}

/** @param {string} id @param {object} patch */
export function updateNote(id, patch) {
  const n = notes.get(id);
  if (!n) return null;
  const next = { ...n };
  if (typeof patch.title === "string") {
    next.title = patch.title.trim() || "Untitled";
  }
  if (typeof patch.body === "string") {
    next.body = patch.body;
  }
  if (Array.isArray(patch.labels)) {
    next.labels = patch.labels;
  }
  if (typeof patch.pinned === "boolean") {
    next.pinned = patch.pinned;
  }
  if (typeof patch.archived === "boolean") {
    next.archived = patch.archived;
  }
  next.updatedAt = Date.now();
  notes.set(id, next);
  schedulePersist();
  return next;
}

/** @param {string} id */
export function removeNote(id) {
  const existed = notes.delete(id);
  if (existed) schedulePersist();
  return existed;
}

/** Vraća sve bilješke, najnovije prvo. */
export function listNotes() {
  return [...notes.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Sinhroni flush na graceful shutdown. */
export function closeNotes() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (dirty) flushNow();
}

/**
 * Zamijeni sve bilješke (za backup restore).
 * @param {Array} newNotes
 */
export function replaceNotes(newNotes) {
  notes.clear();
  if (!Array.isArray(newNotes)) return;
  for (const n of newNotes) {
    if (!n || typeof n.id !== "string") continue;
    if (n.items && Array.isArray(n.items) && n.items.length > 0 && !n.body) {
      n.body = n.items.map(it => `- [${it.completed ? 'x' : ' '}] ${it.text}`).join("\n");
      delete n.items;
    }
    if (n.body === undefined) n.body = "";
    n.labels = Array.isArray(n.labels) ? n.labels : [];
    n.pinned = Boolean(n.pinned) || false;
    n.archived = Boolean(n.archived) || false;
    notes.set(n.id, n);
  }
  flushNow();
}
