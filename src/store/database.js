import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { decryptData, encryptData } from "./crypto.js";

const DATABASE_FILE = path.join(config.DATA_DIR, "noema.sqlite");
let database = null;
let transactionDepth = 0;

function requireCollection(value) {
  const collection = String(value || "").trim();
  if (!/^[a-z][a-z0-9_-]{1,63}$/i.test(collection)) throw new Error("Invalid SQLite collection name.");
  return collection;
}
function encodeRecord(record) { return encryptData(JSON.stringify(record)); }
function decodeRecord(row) { const value = JSON.parse(decryptData(row.payload)); if (!value || typeof value !== "object") throw new Error("SQLite record payload is not an object."); return value; }

export function openDatabase() {
  if (database?.isOpen) return database;
  mkdirSync(config.DATA_DIR, { recursive: true });
  database = new DatabaseSync(DATABASE_FILE, { timeout: 5000, enableForeignKeyConstraints: true });
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
    CREATE TABLE IF NOT EXISTS noema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS noema_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (collection, id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS noema_records_collection_created ON noema_records (collection, created_at DESC);
    CREATE INDEX IF NOT EXISTS noema_records_collection_updated ON noema_records (collection, updated_at DESC);
  `);
  return database;
}

export function databasePath() { return DATABASE_FILE; }
export function assertDatabaseCryptoReadable() { const row = openDatabase().prepare("SELECT payload FROM noema_records LIMIT 1").get(); if (!row) return true; decodeRecord(row); return true; }
export function getMeta(key) { const row = openDatabase().prepare("SELECT value FROM noema_meta WHERE key = ?").get(String(key)); return row ? row.value : null; }
export function setMeta(key, value) { openDatabase().prepare(`INSERT INTO noema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(key), String(value)); }
export function countRecords(collection) { const row = openDatabase().prepare("SELECT COUNT(*) AS count FROM noema_records WHERE collection = ?").get(requireCollection(collection)); return Number(row?.count || 0); }
export function listRecords(collection) { return openDatabase().prepare("SELECT payload FROM noema_records WHERE collection = ? ORDER BY created_at ASC, id ASC").all(requireCollection(collection)).map(decodeRecord); }
export function getRecord(collection, id) { const row = openDatabase().prepare("SELECT payload FROM noema_records WHERE collection = ? AND id = ?").get(requireCollection(collection), String(id)); return row ? decodeRecord(row) : null; }

export function upsertRecord(collection, record) {
  const name = requireCollection(collection);
  if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id) throw new Error(`Cannot save invalid ${name} record.`);
  const now = Date.now(); const createdAt = Number.isFinite(record.createdAt) ? record.createdAt : now; const updatedAt = Number.isFinite(record.updatedAt) ? record.updatedAt : createdAt;
  openDatabase().prepare(`INSERT INTO noema_records (collection, id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at, updated_at = excluded.updated_at`).run(name, record.id, encodeRecord(record), createdAt, updatedAt);
  return record;
}

export function deleteRecord(collection, id) { const result = openDatabase().prepare("DELETE FROM noema_records WHERE collection = ? AND id = ?").run(requireCollection(collection), String(id)); return Number(result.changes || 0) > 0; }

export function deleteRecords(collection, ids) {
  const name = requireCollection(collection);
  const values = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean))];
  if (!values.length) return 0;
  return withImmediateTransaction((db) => {
    const remove = db.prepare("DELETE FROM noema_records WHERE collection = ? AND id = ?");
    let count = 0;
    for (const id of values) count += Number(remove.run(name, id).changes || 0);
    return count;
  });
}

export function upsertRecords(collection, records) {
  const name = requireCollection(collection);
  const values = Array.isArray(records) ? records : [];
  return withImmediateTransaction((db) => {
    const upsert = db.prepare(`INSERT INTO noema_records (collection, id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at, updated_at = excluded.updated_at`);
    let count = 0;
    for (const record of values) {
      if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id) continue;
      const now = Date.now(); const createdAt = Number.isFinite(record.createdAt) ? record.createdAt : now; const updatedAt = Number.isFinite(record.updatedAt) ? record.updatedAt : createdAt;
      upsert.run(name, record.id, encodeRecord(record), createdAt, updatedAt); count += 1;
    }
    return count;
  });
}

export function withImmediateTransaction(callback) {
  if (typeof callback !== "function") throw new TypeError("Transaction callback is required.");
  const db = openDatabase();
  if (transactionDepth > 0) return callback(db);
  db.exec("BEGIN IMMEDIATE"); transactionDepth += 1;
  try {
    const result = callback(db);
    if (result && typeof result.then === "function") throw new Error("SQLite transaction callback must be synchronous.");
    db.exec("COMMIT"); return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally { transactionDepth -= 1; }
}

export function replaceRecords(collection, records) {
  const name = requireCollection(collection);
  const values = Array.isArray(records) ? records : [];
  return withImmediateTransaction((db) => {
    const remove = db.prepare("DELETE FROM noema_records WHERE collection = ?");
    const insert = db.prepare(`INSERT INTO noema_records (collection, id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`);
    remove.run(name);
    for (const record of values) {
      if (!record || typeof record.id !== "string" || !record.id) continue;
      const now = Date.now(); const createdAt = Number.isFinite(record.createdAt) ? record.createdAt : now; const updatedAt = Number.isFinite(record.updatedAt) ? record.updatedAt : createdAt;
      insert.run(name, record.id, encodeRecord(record), createdAt, updatedAt);
    }
  });
}

export function checkpointDatabase() { if (!database?.isOpen) return; database.exec("PRAGMA wal_checkpoint(TRUNCATE)"); }
export function closeDatabase() { if (!database?.isOpen) return; checkpointDatabase(); database.close(); database = null; transactionDepth = 0; }
