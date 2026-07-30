import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";
import {
  countRecords,
  deleteRecord,
  getMeta,
  getRecord,
  listRecords,
  replaceRecords,
  setMeta,
  upsertRecord,
} from "./database.js";

const MIRROR_DELAY_MS = 150;
const mirrorFlushers = new Set();

export function flushCollectionMirrors() {
  for (const flush of mirrorFlushers) flush();
}

export function createCollection({ name, legacyFile, normalize = (value) => value, validate = (value) => Boolean(value?.id) }) {
  const legacyPath = path.join(config.DATA_DIR, legacyFile);
  const migrationKey = `legacy-json-migrated:${name}`;
  let loaded = false;
  let mirrorDirty = false;
  let mirrorTimer = null;

  function clean(value) {
    if (!validate(value)) return null;
    const normalized = normalize(structuredClone(value));
    return validate(normalized) ? normalized : null;
  }

  function currentRecords() {
    return listRecords(name).map(clean).filter(Boolean);
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
    loaded = true;
    return currentRecords();
  }

  function list() {
    if (!loaded) load();
    return currentRecords();
  }

  function get(id) {
    if (!loaded) load();
    const value = getRecord(name, id);
    return value ? clean(value) : null;
  }

  function set(value) {
    if (!loaded) load();
    const normalized = clean(value);
    if (!normalized) throw new Error(`Invalid ${name} record.`);
    upsertRecord(name, normalized);
    scheduleMirror();
    return normalized;
  }

  function remove(id) {
    if (!loaded) load();
    const removed = deleteRecord(name, id);
    if (removed) scheduleMirror();
    return removed;
  }

  function replace(values) {
    if (!loaded) load();
    const records = (Array.isArray(values) ? values : []).map(clean).filter(Boolean);
    replaceRecords(name, records);
    scheduleMirror();
    return records;
  }

  function close() {
    flushMirror();
  }

  return { load, list, get, set, remove, replace, close, legacyPath };
}
