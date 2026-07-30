import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const DATA_DIR = config.DATA_DIR;
const KEY_FILE = path.join(DATA_DIR, "master.key");

let ENCRYPTION_KEY = Buffer.alloc(0);

/**
 * Inicijalizuj ključ za enkripciju podataka u mirovanju (data/*.json).
 *
 * Dva moda, jasno razdvojena:
 *   - "salt" mod (kada je ENCRYPTION_KEY postavljen): ključ se izvodi iz lozinke
 *     i salt-a (scrypt). Na disk se čuva SAMO salt — sam ključ nikad ne dira disk,
 *     pa je lozinka stvarno potrebna pri svakom startu.
 *   - "key" mod (bez ENCRYPTION_KEY): generiše se nasumičan ključ i čuva na disku
 *     (mode 0600). Ovo je samo zaštita-na-disku (npr. ako curi backup bez .key),
 *     NE štiti od nekoga ko ima pristup i data/master.key fajlu.
 *
 * Fail-fast: neispravan/neusklađen master.key baca grešku umesto da tiho prepiše
 * postojeći ključ (čime bi postojeći podaci postali nedešifrabilni).
 */
export function initCrypto(envKey) {
  const password = typeof envKey === "string" && envKey ? envKey : null;

  if (existsSync(KEY_FILE)) {
    const raw = readFileSync(KEY_FILE, "utf8").trim();
    if (loadExistingKey(raw, password)) return;
    throw new Error(
      "[noema] data/master.key je neispravan ili ne odgovara ENCRYPTION_KEY. " +
        "Provjeri konfiguraciju (ne prepisujem ključ automatski da ne izgubim podatke).",
    );
  }

  // Nema key fajla — kreiraj novi.
  mkdirSync(DATA_DIR, { recursive: true });
  if (password) {
    const salt = crypto.randomBytes(16);
    ENCRYPTION_KEY = crypto.scryptSync(password, salt, 32);
    writeFileSync(KEY_FILE, `v2:salt:${salt.toString("hex")}`, { mode: 0o600 });
    console.log("[noema] Master ključ izveden iz ENCRYPTION_KEY (na disku samo salt).");
  } else {
    ENCRYPTION_KEY = crypto.randomBytes(32);
    writeFileSync(KEY_FILE, `v2:key:${ENCRYPTION_KEY.toString("hex")}`, { mode: 0o600 });
    console.log("[noema] Generisan lokalni master ključ. Za ključ izveden iz lozinke postavi ENCRYPTION_KEY.");
  }
}

/**
 * Učitaj postojeći ključ iz raznih formata. Vraća true ako je uspeo, false ako
 * je fajl neprepoznatljiv. Migrira legacy formate na v2 (bez gubitka podataka).
 */
function loadExistingKey(raw, password) {
  // v2:salt:<salthex> — ključ izveden iz lozinke, na disku samo salt.
  if (raw.startsWith("v2:salt:")) {
    if (!password) {
      throw new Error("[noema] master.key zahtijeva ENCRYPTION_KEY (ključ izveden iz lozinke), a varijabla nije postavljena.");
    }
    const salt = Buffer.from(raw.slice("v2:salt:".length), "hex");
    ENCRYPTION_KEY = crypto.scryptSync(password, salt, 32);
    return true;
  }

  // v2:key:<keyhex> — nasumičan ključ sačuvan na disku.
  if (raw.startsWith("v2:key:")) {
    ENCRYPTION_KEY = Buffer.from(raw.slice("v2:key:".length), "hex");
    return true;
  }

  // Legacy "salt:key" (oba hex) — ranije se izvedeni ključ čuvao u plaintextu.
  const parts = raw.split(":");
  if (parts.length === 2 && /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1])) {
    const salt = Buffer.from(parts[0], "hex");
    const storedKey = Buffer.from(parts[1], "hex");
    if (password) {
      const derived = crypto.scryptSync(password, salt, 32);
      if (!derived.equals(storedKey)) {
        throw new Error("[noema] ENCRYPTION_KEY ne odgovara postojećem ključu u master.key.");
      }
      ENCRYPTION_KEY = derived;
      writeFileSync(KEY_FILE, `v2:salt:${salt.toString("hex")}`, { mode: 0o600 }); // skloni ključ sa diska
    } else {
      ENCRYPTION_KEY = storedKey;
      writeFileSync(KEY_FILE, `v2:key:${storedKey.toString("hex")}`, { mode: 0o600 });
    }
    return true;
  }

  // Legacy raw 64-hex (nasumičan ključ bez salt-a).
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    ENCRYPTION_KEY = Buffer.from(raw, "hex");
    writeFileSync(KEY_FILE, `v2:key:${raw.toLowerCase()}`, { mode: 0o600 });
    return true;
  }

  return false;
}

export function encryptData(text) {
  if (ENCRYPTION_KEY.length === 0) throw new Error("Kripto nije inicijalizovan");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptData(encryptedStr) {
  if (ENCRYPTION_KEY.length === 0) throw new Error("Kripto nije inicijalizovan");
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) throw new Error("Neispravan format enkriptovanih podataka");
  
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encryptedText = parts[2];

  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function readEncryptedJson(filePath, defaultValue = [], { throwOnError = false } = {}) {
  if (!existsSync(filePath)) return defaultValue;
  
  try {
    const raw = readFileSync(filePath, "utf8").trim();
    // Migracija: ako počinje sa [ ili { onda je obično JSON
    if (raw.startsWith("[") || raw.startsWith("{")) {
      return JSON.parse(raw);
    }
    
    // Inače pokušaj dekripciju
    const decrypted = decryptData(raw);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error(`[noema] Greška pri čitanju/dekripciji ${filePath}:`, err.message);
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
