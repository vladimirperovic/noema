import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Centralized, validated environment configuration. */
try {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // A missing .env file is expected in container deployments.
}

function fail(message) {
  console.error(`[noema] Invalid configuration:\n  ${message}\nCheck the environment or .env file.`);
  process.exit(1);
}

function numberValue(key, fallback) {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) fail(`Invalid numeric value for ${key}: "${value}"`);
  return parsed;
}

function stringValue(key, fallback) {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

function booleanValue(key, fallback = false) {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  fail(`Invalid boolean value for ${key}: "${value}"`);
}

function listValue(key, fallback = "") {
  return stringValue(key, fallback).split(",").map((value) => value.trim()).filter(Boolean);
}

const PORT = numberValue("PORT", 3000);
const HOST = stringValue("HOST", "0.0.0.0");
const NODE_ENV = stringValue("NODE_ENV", "development");
const ALLOW_INSECURE_NO_AUTH = booleanValue("ALLOW_INSECURE_NO_AUTH", false);

let PUBLIC_BASE_URL = stringValue("PUBLIC_BASE_URL", `http://localhost:${PORT}`).replace(/\/+$/, "");
const NOEMA_API_TOKEN = stringValue("NOEMA_API_TOKEN", "");
const UI_PASSWORD = stringValue("UI_PASSWORD", "");
let NOEMA_CORS_ORIGIN = stringValue("NOEMA_CORS_ORIGIN", "*");
if (UI_PASSWORD && NOEMA_CORS_ORIGIN === "*") NOEMA_CORS_ORIGIN = PUBLIC_BASE_URL;

const ENCRYPTION_KEY = stringValue("ENCRYPTION_KEY", "");
const NOEMA_BACKUP_PASSWORD = stringValue("NOEMA_BACKUP_PASSWORD", "");
const NOEMA_TIMEZONE = stringValue("NOEMA_TIMEZONE", "UTC");
const DATA_DIR = path.resolve(stringValue("NOEMA_DATA_DIR", path.join(process.cwd(), "data")));
const EXISTING_INSTALLATION = existsSync(path.join(DATA_DIR, "master.key")) || existsSync(path.join(DATA_DIR, "noema.sqlite"));
const LEGACY_SHORT_UI_PASSWORD = Boolean(UI_PASSWORD && UI_PASSWORD.length < 14 && EXISTING_INSTALLATION);
const LEGACY_SHORT_API_TOKEN = Boolean(NOEMA_API_TOKEN && NOEMA_API_TOKEN.length < 32 && EXISTING_INSTALLATION);
const SESSION_IDLE_TTL_MS = numberValue("SESSION_IDLE_HOURS", 24) * 60 * 60 * 1000;
const SESSION_ABSOLUTE_TTL_MS = numberValue("SESSION_ABSOLUTE_HOURS", 168) * 60 * 60 * 1000;
const GALLERY_SHARE_TTL_DAYS = numberValue("GALLERY_SHARE_TTL_DAYS", 30);
const TRUSTED_PROXY_IPS = Object.freeze(listValue("NOEMA_TRUSTED_PROXY_IPS"));
const NOEMA_HTTP_USER_AGENT = stringValue("NOEMA_HTTP_USER_AGENT", "Noema/0.3 (self-hosted; configure an operator contact)");
const NOEMA_ANALYTICS_PROJECTS = stringValue("NOEMA_ANALYTICS_PROJECTS", "");

if (SESSION_IDLE_TTL_MS > SESSION_ABSOLUTE_TTL_MS) fail("SESSION_IDLE_HOURS cannot exceed SESSION_ABSOLUTE_HOURS.");
if (NOEMA_BACKUP_PASSWORD && NOEMA_BACKUP_PASSWORD.length < 12) fail("NOEMA_BACKUP_PASSWORD must contain at least 12 characters.");
if (NODE_ENV === "production" && !ALLOW_INSECURE_NO_AUTH) {
  const errors = [];
  if (!UI_PASSWORD) errors.push("UI_PASSWORD is required in production");
  else if (UI_PASSWORD.length < 14 && !LEGACY_SHORT_UI_PASSWORD) errors.push("UI_PASSWORD must contain at least 14 characters for a new production installation");
  if (!NOEMA_API_TOKEN) errors.push("NOEMA_API_TOKEN is required in production");
  else if (NOEMA_API_TOKEN.length < 32 && !LEGACY_SHORT_API_TOKEN) errors.push("NOEMA_API_TOKEN must contain at least 32 characters for a new production installation");
  if (NOEMA_API_TOKEN && UI_PASSWORD && NOEMA_API_TOKEN === UI_PASSWORD) errors.push("NOEMA_API_TOKEN must be different from UI_PASSWORD");
  if (!PUBLIC_BASE_URL.startsWith("https://")) errors.push("PUBLIC_BASE_URL must use HTTPS in production");
  if (NOEMA_CORS_ORIGIN === "*") errors.push("NOEMA_CORS_ORIGIN cannot be * in production");
  if (errors.length) fail(errors.join("; "));

  if (LEGACY_SHORT_UI_PASSWORD) {
    console.warn("[noema] Existing installation uses a UI_PASSWORD shorter than 14 characters. Startup is allowed for migration compatibility; rotate it after confirming the current data key can be unlocked.");
  }
  if (LEGACY_SHORT_API_TOKEN) {
    console.warn("[noema] Existing installation uses a NOEMA_API_TOKEN shorter than 32 characters. Startup is allowed for migration compatibility; rotate the token when practical.");
  }
}

const GOOGLE_CLIENT_ID = stringValue("GOOGLE_CLIENT_ID", "");
const GOOGLE_CLIENT_SECRET = stringValue("GOOGLE_CLIENT_SECRET", "");
const GOOGLE_REFRESH_TOKEN = stringValue("GOOGLE_REFRESH_TOKEN", "");
const GOOGLE_CALENDAR_ID = stringValue("GOOGLE_CALENDAR_ID", "primary");
const GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_REDIRECT_URI = `${PUBLIC_BASE_URL}/auth/google/callback`;
const GA4_CLIENT_EMAIL = stringValue("GA4_CLIENT_EMAIL", "");
const GA4_PRIVATE_KEY = stringValue("GA4_PRIVATE_KEY", "");
const PAGESPEED_API_KEY = stringValue("PAGESPEED_API_KEY", "");

export const config = Object.freeze({
  PORT, HOST, NODE_ENV, PUBLIC_BASE_URL, NOEMA_API_TOKEN, NOEMA_CORS_ORIGIN, UI_PASSWORD,
  ENCRYPTION_KEY, NOEMA_BACKUP_PASSWORD, NOEMA_TIMEZONE, DATA_DIR, ALLOW_INSECURE_NO_AUTH,
  SESSION_IDLE_TTL_MS, SESSION_ABSOLUTE_TTL_MS, GALLERY_SHARE_TTL_DAYS, TRUSTED_PROXY_IPS,
  NOEMA_HTTP_USER_AGENT, NOEMA_ANALYTICS_PROJECTS,
  uiAuthEnabled: UI_PASSWORD.length > 0,
  authEnabled: NOEMA_API_TOKEN.length > 0,
  apiAuthEnabled: NOEMA_API_TOKEN.length > 0,
  isProduction: NODE_ENV === "production",
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID,
  GOOGLE_OAUTH_SCOPE, GOOGLE_REDIRECT_URI, GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY, PAGESPEED_API_KEY,
  calendarConfigured: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
  directAnalyticsConfigured: Boolean(GA4_CLIENT_EMAIL && GA4_PRIVATE_KEY),
  analyticsConfigured: Boolean(GA4_CLIENT_EMAIL && GA4_PRIVATE_KEY && NOEMA_ANALYTICS_PROJECTS),
});
