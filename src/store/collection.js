import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";
import {
  countRecords,
  deleteRecord,
  deleteRecords,
  getMeta,
  listRecords,
  replaceRecords,
  setMeta,
  upsertRecord,
  upsertRecords,
} from "./database.js";

const MIRROR_DELAY_MS = 150;
const mirrorFlushers = new Set();

export function flushCollectionMirrors() {
  for (const flush of mirrorFlushers) flush();
}

export function createCollection({ name, legacyFile, normalize = (value) => value, validate = (value) => Boolean(value?.id) }) {
  const legacyPath = path.join(config.DATA_DIR, legacyFile);
  const migrationKey = `legacy-json-migrated:${name}`;
  const cache = new Map();
  let loaded = false;
  let mirrorDirty = false;
  let mirrorTimer = null;

  function clean(value) {
    if (!validate(value)) return null;
    const normalized = normalize(structuredClone(value));
    return validate(normalized) ? normalized : null;
  }

  function cacheRecords(records) {
    cache.clear();
    for (const record of records) cache.set(record.id, record);
  }

  function currentRecords() {
    return [...cache.values()].map((record) => structuredClone(record));
  }

  function flushMirror() {
    if (mirrorTimer) {
      clearTimeout(mirrorTimer);
      mirrorTimer = null;
    }
    if (!mirrorDirty) return;
    const records = currentRecords().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    writeEncryptedJson(legacyPath, records);
    mirrorDirty = false;
  }

  mirrorFlushers.add(flushMirror);

  function scheduleMirror() {
    mirrorDirty = true;
    if (mirrorTimer) return;
    mirrorTimer = setTimeout(flushMirror, MIRROR_DELAY_MS);
    mirrorTimer.unref?.();
  }

  function load() {
    if (loaded) return currentRecords();
    if (countRecords(name) === 0 && !getMeta(migrationKey) && existsSync(legacyPath)) {
      const legacy = readEncryptedJson(legacyPath, [], { throwOnError: true });
      if (!Array.isArray(legacy)) throw new Error(`${legacyFile} must contain an array.`);
      const records = legacy.map(clean).filter(Boolean);
      replaceRecords(name, records);
      setMeta(migrationKey, JSON.stringify({ importedAt: new Date().toISOString(), count: records.length }));
      console.log(`[noema] Imported ${records.length} ${name} records from ${legacyFile} into SQLite.`);
    }
    cacheRecords(listRecords(name).map(clean).filter(Boolean));
    loaded = true;
    return currentRecords();
  }

  function list() {
    if (!loaded) load();
    return currentRecords();
  }

  function get(id) {
    if (!loaded) load();
    const value = cache.get(String(id));
    return value ? structuredClone(value) : null;
  }

  function set(value) {
    if (!loaded) load();
    const normalized = clean(value);
    if (!normalized) throw new Error(`Invalid ${name} record.`);
    upsertRecord(name, normalized);
    cache.set(normalized.id, normalized);
    scheduleMirror();
    return structuredClone(normalized);
  }

  function setMany(values) {
    if (!loaded) load();
    const records = (Array.isArray(values) ? values : []).map(clean).filter(Boolean);
    if (!records.length) return [];
    upsertRecords(name, records);
    for (const record of records) cache.set(record.id, record);
    scheduleMirror();
    return records.map((record) => structuredClone(record));
  }

  function remove(id) {
    if (!loaded) load();
    const key = String(id);
    const removed = deleteRecord(name, key);
    if (removed) {
      cache.delete(key);
      scheduleMirror();
    }
    return removed;
  }

  function removeMany(ids) {
    if (!loaded) load();
    const values = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean))];
    if (!values.length) return 0;
    const count = deleteRecords(name, values);
    if (count) {
      for (const id of values) cache.delete(id);
      scheduleMirror();
    }
    return count;
  }

  function replace(values) {
    if (!loaded) load();
    const records = (Array.isArray(values) ? values : []).map(clean).filter(Boolean);
    replaceRecords(name, records);
    cacheRecords(records);
    scheduleMirror();
    return records.map((record) => structuredClone(record));
  }

  function close() {
    flushMirror();
  }

  return { load, list, get, set, setMany, remove, removeMany, replace, close, legacyPath };
}
