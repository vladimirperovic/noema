import { randomUUID } from "node:crypto";
import { createCollection } from "./collection.js";

function text(value, max = 500) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function httpUrl(value) {
  const raw = text(value, 1200);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((item) => text(item, 40).replace(/^#+/, "")).filter(Boolean))].slice(0, 20);
}

function normalizeWorkImages(value) {
  const source = Array.isArray(value) ? value : [];
  return source.slice(0, 24).map((item) => {
    if (typeof item === "string") return { url: httpUrl(item), caption: "" };
    return { url: httpUrl(item?.url), caption: text(item?.caption, 180) };
  }).filter((item) => item.url);
}

function normalizeContact(raw = {}) {
  const now = Date.now();
  return {
    id: text(raw.id, 100) || randomUUID(),
    category: text(raw.category, 100) || "Ostalo",
    name: text(raw.name, 180),
    company: text(raw.company, 180),
    role: text(raw.role, 120),
    phone: text(raw.phone, 80),
    phone2: text(raw.phone2, 80),
    email: text(raw.email, 180),
    website: httpUrl(raw.website),
    address: text(raw.address, 320),
    city: text(raw.city, 120),
    notes: text(raw.notes, 4000),
    tags: normalizeTags(raw.tags),
    workImages: normalizeWorkImages(raw.workImages),
    favorite: bool(raw.favorite),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

const contacts = createCollection({
  name: "contacts",
  legacyFile: "contacts.json",
  normalize: normalizeContact,
  validate: (contact) => Boolean(contact && typeof contact.id === "string" && contact.id),
});

function assertValid(contact) {
  if (!contact.name && !contact.company) throw Object.assign(new Error("Unesi ime kontakta ili naziv firme."), { status: 400 });
  if (!contact.category) throw Object.assign(new Error("Kategorija je obavezna."), { status: 400 });
}

export function loadContacts() { contacts.load(); }
export function getContact(id) { return contacts.get(id); }
export function addContact(input = {}) {
  const now = Date.now();
  const contact = normalizeContact({ ...input, id: randomUUID(), createdAt: now, updatedAt: now });
  assertValid(contact);
  return contacts.set(contact);
}
export function updateContact(id, patch = {}) {
  const current = contacts.get(id);
  if (!current) return null;
  const next = normalizeContact({ ...current, ...patch, id: current.id, createdAt: current.createdAt, updatedAt: Date.now() });
  assertValid(next);
  return contacts.set(next);
}
export function removeContact(id) { return contacts.remove(id); }
export function listContacts() {
  return contacts.list().sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.category.localeCompare(b.category, "sr") || (a.name || a.company).localeCompare(b.name || b.company, "sr"));
}
export function replaceContacts(values) { return contacts.replace(values); }
export function closeContacts() { contacts.close(); }
