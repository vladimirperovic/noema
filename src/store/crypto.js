import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const DATA_DIR = config.DATA_DIR;
const KEY_FILE = path.join(DATA_DIR, "master.key");
const BINARY_MAGIC = Buffer.from("NOEMA-FILE-V1\0", "utf8");
const BINARY_IV_BYTES = 12;
const BINARY_TAG_BYTES = 16;
const KEY_WRAP_AAD = Buffer.from("noema-master-key-v3", "utf8");
const WRAPPED_PREFIX = "v3:wrapped:";

let ENCRYPTION_KEY = Buffer.alloc(0);
let KEY_MODE = "uninitialized";

function normalizePassword(value) {
  return typeof value === "string" && value ? value : null;
}

function uniquePasswords(...values) {
  return [...new Set(values.map(normalizePassword).filter(Boolean))];
}

function atomicWriteKey(value) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = `${KEY_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, value, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, KEY_FILE);
  } catch (error) {
    try { unlinkSync(tempPath); } catch {}
    throw error;
  }
}

function wrappedKeyPayload(dataKey, password) {
  const secret = normalizePassword(password);
  if (!secret) throw new Error("[noema] Master password is required to protect the data key.");
  if (!Buffer.isBuffer(dataKey) || dataKey.length !== 32) throw new Error("[noema] Invalid installation data key.");
  const salt = crypto.randomBytes(16);
  const wrappingKey = crypto.scryptSync(secret, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", wrappingKey, iv);
  cipher.setAAD(KEY_WRAP_AAD);
  const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${WRAPPED_PREFIX}${salt.toString("hex")}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function persistWrappedKey(dataKey, password) {
  atomicWriteKey(wrappedKeyPayload(dataKey, password));
  KEY_MODE = "wrapped";
}

function unwrapKey(raw, password) {
  const secret = normalizePassword(password);
  if (!secret) throw new Error("[noema] master.key requires the Noema master password.");
  const parts = raw.split(":");
  if (parts.length !== 6 || parts[0] !== "v3" || parts[1] !== "wrapped") return null;
  try {
    const salt = Buffer.from(parts[2], "hex");
    const iv = Buffer.from(parts[3], "hex");
    const tag = Buffer.from(parts[4], "hex");
    const encrypted = Buffer.from(parts[5], "hex");
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || encrypted.length !== 32) throw new Error("invalid wrapped key lengths");
    const wrappingKey = crypto.scryptSync(secret, salt, 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", wrappingKey, iv);
    decipher.setAAD(KEY_WRAP_AAD);
    decipher.setAuthTag(tag);
    const key = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    if (key.length !== 32) throw new Error("Invalid master key length.");
    return key;
  } catch {
    throw new Error("[noema] Master password does not unlock wrapped master.key.");
  }
}

export function initCrypto(options = {}) {
  let masterPassword = null;
  let legacyPassword = null;

  if (typeof options === "string") {
    masterPassword = normalizePassword(config.UI_PASSWORD) || normalizePassword(options);
    legacyPassword = normalizePassword(options);
  } else {
    masterPassword = normalizePassword(options?.masterPassword) || normalizePassword(config.UI_PASSWORD);
    legacyPassword = normalizePassword(options?.legacyPassword) || normalizePassword(config.ENCRYPTION_KEY);
  }

  if (existsSync(KEY_FILE)) {
    const raw = readFileSync(KEY_FILE, "utf8").trim();
    if (loadExistingKey(raw, { masterPassword, legacyPassword })) return;
    throw new Error("[noema] data/master.key is invalid or does not match configuration. The key will not be overwritten automatically.");
  }

  mkdirSync(DATA_DIR, { recursive: true });
  if (masterPassword) {
    ENCRYPTION_KEY = crypto.randomBytes(32);
    persistWrappedKey(ENCRYPTION_KEY, masterPassword);
    console.log("[noema] Generated random data key protected by the Noema master password.");
  } else if (legacyPassword) {
    const salt = crypto.randomBytes(16);
    ENCRYPTION_KEY = crypto.scryptSync(legacyPassword, salt, 32);
    KEY_MODE = "derived";
    atomicWriteKey(`v2:salt:${salt.toString("hex")}`);
    console.log("[noema] Data key derived from legacy ENCRYPTION_KEY; sign in once to migrate to one-password mode.");
  } else {
    ENCRYPTION_KEY = crypto.randomBytes(32);
    KEY_MODE = "local";
    atomicWriteKey(`v2:key:${ENCRYPTION_KEY.toString("hex")}`);
    console.log("[noema] Generated local data key. Configure UI_PASSWORD to protect it with the master password.");
  }
}

function loadExistingKey(raw, { masterPassword, legacyPassword }) {
  if (raw.startsWith(WRAPPED_PREFIX)) {
    const candidates = uniquePasswords(masterPassword, config.UI_PASSWORD, legacyPassword, config.ENCRYPTION_KEY);
    if (!candidates.length) throw new Error("[noema] data/master.key requires UI_PASSWORD.");
    let lastError = null;
    for (const password of candidates) {
      try {
        ENCRYPTION_KEY = unwrapKey(raw, password);
        KEY_MODE = "wrapped";
        return true;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error("[noema] No configured password unlocks data/master.key.");
  }

  if (raw.startsWith("v2:salt:")) {
    const password = uniquePasswords(legacyPassword, config.ENCRYPTION_KEY, masterPassword, config.UI_PASSWORD)[0];
    if (!password) throw new Error("[noema] Legacy master.key requires ENCRYPTION_KEY or UI_PASSWORD for migration.");
    const salt = Buffer.from(raw.slice("v2:salt:".length), "hex");
    ENCRYPTION_KEY = crypto.scryptSync(password, salt, 32);
    KEY_MODE = "derived";
    return true;
  }

  if (raw.startsWith("v2:key:")) {
    ENCRYPTION_KEY = Buffer.from(raw.slice("v2:key:".length), "hex");
    if (ENCRYPTION_KEY.length !== 32) return false;
    KEY_MODE = "local";
    return true;
  }

  const parts = raw.split(":");
  if (parts.length === 2 && /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1])) {
    const salt = Buffer.from(parts[0], "hex");
    const storedKey = Buffer.from(parts[1], "hex");
    const candidate = uniquePasswords(legacyPassword, config.ENCRYPTION_KEY, masterPassword, config.UI_PASSWORD)[0];
    if (candidate) {
      const derived = crypto.scryptSync(candidate, salt, 32);
      if (!derived.equals(storedKey)) throw new Error("[noema] Configured password does not match legacy master.key.");
    }
    ENCRYPTION_KEY = storedKey;
    KEY_MODE = "local";
    return ENCRYPTION_KEY.length === 32;
  }

  if (/^[0-9a-f]{64}$/i.test(raw)) {
    ENCRYPTION_KEY = Buffer.from(raw, "hex");
    KEY_MODE = "local";
    return true;
  }
  return false;
}

export function protectCryptoWithPassword(password) {
  const secret = normalizePassword(password);
  if (!secret) throw new Error("[noema] A master password is required.");
  if (ENCRYPTION_KEY.length !== 32) throw new Error("[noema] Crypto is not initialized.");
  if (existsSync(KEY_FILE)) {
    const raw = readFileSync(KEY_FILE, "utf8").trim();
    if (raw.startsWith(WRAPPED_PREFIX)) {
      try {
        const key = unwrapKey(raw, secret);
        if (!key.equals(ENCRYPTION_KEY)) throw new Error("[noema] Master password unlocked a different data key.");
        KEY_MODE = "wrapped";
        return false;
      } catch {
        persistWrappedKey(ENCRYPTION_KEY, secret);
        console.log("[noema] Legacy v3 master.key re-wrapped with UI_PASSWORD.");
        return true;
      }
    }
  }
  persistWrappedKey(ENCRYPTION_KEY, secret);
  console.log("[noema] master.key migrated to one-password mode; ENCRYPTION_KEY is no longer needed after restart.");
  return true;
}

function requireKey() {
  if (ENCRYPTION_KEY.length !== 32) throw new Error("Crypto is not initialized");
  return ENCRYPTION_KEY;
}

function aadBuffer(value) {
  if (!value) return Buffer.alloc(0);
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
}

export function cryptoStatus() {
  return Object.freeze({ initialized: ENCRYPTION_KEY.length === 32, algorithm: "AES-256-GCM", externallyDerived: KEY_MODE === "derived" || KEY_MODE === "wrapped", keyMode: KEY_MODE });
}

export function encryptData(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", requireKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptData(encryptedStr) {
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted data format");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encryptedText = parts[2];
  const decipher = crypto.createDecipheriv("aes-256-gcm", requireKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encryptBuffer(value, associatedData = "") {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const iv = crypto.randomBytes(BINARY_IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", requireKey(), iv);
  const aad = aadBuffer(associatedData);
  if (aad.length) cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BINARY_MAGIC, iv, tag, encrypted]);
}

export function isEncryptedBuffer(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  return input.length >= BINARY_MAGIC.length + BINARY_IV_BYTES + BINARY_TAG_BYTES && input.subarray(0, BINARY_MAGIC.length).equals(BINARY_MAGIC);
}

export function decryptBuffer(value, associatedData = "") {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  if (!isEncryptedBuffer(input)) throw new Error("Binary content is not in the Noema encrypted format.");
  const ivStart = BINARY_MAGIC.length;
  const tagStart = ivStart + BINARY_IV_BYTES;
  const dataStart = tagStart + BINARY_TAG_BYTES;
  const iv = input.subarray(ivStart, tagStart);
  const tag = input.subarray(tagStart, dataStart);
  const ciphertext = input.subarray(dataStart);
  const decipher = crypto.createDecipheriv("aes-256-gcm", requireKey(), iv);
  const aad = aadBuffer(associatedData);
  if (aad.length) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptAssetChunk(value, associatedData = "") {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const iv = crypto.randomBytes(BINARY_IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", requireKey(), iv);
  const aad = aadBuffer(associatedData);
  if (aad.length) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptAssetChunk(value, associatedData = "") {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  if (input.length < BINARY_IV_BYTES + BINARY_TAG_BYTES) throw new Error("Private asset chunk is invalid.");
  const iv = input.subarray(0, BINARY_IV_BYTES);
  const tag = input.subarray(BINARY_IV_BYTES, BINARY_IV_BYTES + BINARY_TAG_BYTES);
  const ciphertext = input.subarray(BINARY_IV_BYTES + BINARY_TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", requireKey(), iv);
  const aad = aadBuffer(associatedData);
  if (aad.length) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function readEncryptedJson(filePath, defaultValue = [], { throwOnError = false } = {}) {
  if (!existsSync(filePath)) return defaultValue;
  try {
    const raw = readFileSync(filePath, "utf8").trim();
    if (raw.startsWith("[") || raw.startsWith("{")) return JSON.parse(raw);
    const decrypted = decryptData(raw);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error(`[noema] Error reading/decrypting ${filePath}:`, err.message);
    if (throwOnError) throw err;
    return defaultValue;
  }
}

export function writeEncryptedJson(filePath, data) {
  const jsonStr = JSON.stringify(data, null, 2);
  const encrypted = encryptData(jsonStr);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, encrypted, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, filePath);
  } catch (err) {
    try { unlinkSync(tempPath); } catch {}
    throw err;
  }
}
