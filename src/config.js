import { readFileSync } from "node:fs";

/**
 * Centralized, validated environment configuration.
 *
 * Other modules should use `config` instead of reading `process.env` directly.
 * An optional .env file is loaded without an external dependency.
 */
try {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // A missing .env file is expected in container and hosted deployments.
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

function fail(message) {
  console.error(`[noema] Invalid configuration:\n  ${message}\nCheck the environment or .env file.`);
  process.exit(1);
}

const PORT = numberValue("PORT", 3000);
const HOST = stringValue("HOST", "0.0.0.0");
const NODE_ENV = stringValue("NODE_ENV", "development");

let PUBLIC_BASE_URL = stringValue("PUBLIC_BASE_URL", `http://localhost:${PORT}`);
PUBLIC_BASE_URL = PUBLIC_BASE_URL.replace(/\/+$/, "");

const NOEMA_API_TOKEN = stringValue("NOEMA_API_TOKEN", "");
const UI_PASSWORD = stringValue("UI_PASSWORD", "");
const ENCRYPTION_KEY = stringValue("ENCRYPTION_KEY", "");
const NOEMA_TIMEZONE = stringValue("NOEMA_TIMEZONE", "UTC");
const NOEMA_HTTP_USER_AGENT = stringValue(
  "NOEMA_HTTP_USER_AGENT",
  "Noema/0.1 (self-hosted; configure NOEMA_HTTP_USER_AGENT with an operator contact)",
);

let NOEMA_CORS_ORIGIN = stringValue("NOEMA_CORS_ORIGIN", "*");
if (UI_PASSWORD && NOEMA_CORS_ORIGIN === "*") NOEMA_CORS_ORIGIN = PUBLIC_BASE_URL;

// JSON array defining optional analytics projects. The public repository contains
// no personal domains, Search Console sites, brand terms, or GA4 property IDs.
const NOEMA_ANALYTICS_PROJECTS = stringValue("NOEMA_ANALYTICS_PROJECTS", "");

// Google Calendar OAuth 2.0, read-only.
const GOOGLE_CLIENT_ID = stringValue("GOOGLE_CLIENT_ID", "");
const GOOGLE_CLIENT_SECRET = stringValue("GOOGLE_CLIENT_SECRET", "");
const GOOGLE_REFRESH_TOKEN = stringValue("GOOGLE_REFRESH_TOKEN", "");
const GOOGLE_CALENDAR_ID = stringValue("GOOGLE_CALENDAR_ID", "primary");
const GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_REDIRECT_URI = `${PUBLIC_BASE_URL}/auth/google/callback`;

// Optional direct Google Analytics, Search Console, and PageSpeed access.
const GA4_CLIENT_EMAIL = stringValue("GA4_CLIENT_EMAIL", "");
const GA4_PRIVATE_KEY = stringValue("GA4_PRIVATE_KEY", "");
const PAGESPEED_API_KEY = stringValue("PAGESPEED_API_KEY", "");

export const config = Object.freeze({
  PORT,
  HOST,
  NODE_ENV,
  PUBLIC_BASE_URL,
  NOEMA_API_TOKEN,
  NOEMA_CORS_ORIGIN,
  UI_PASSWORD,
  ENCRYPTION_KEY,
  NOEMA_TIMEZONE,
  NOEMA_HTTP_USER_AGENT,
  NOEMA_ANALYTICS_PROJECTS,
  uiAuthEnabled: UI_PASSWORD.length > 0,
  authEnabled: NOEMA_API_TOKEN.length > 0,
  isProduction: NODE_ENV === "production",
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  GOOGLE_CALENDAR_ID,
  GOOGLE_OAUTH_SCOPE,
  GOOGLE_REDIRECT_URI,
  GA4_CLIENT_EMAIL,
  GA4_PRIVATE_KEY,
  PAGESPEED_API_KEY,
  calendarConfigured: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
  directAnalyticsConfigured: Boolean(GA4_CLIENT_EMAIL && GA4_PRIVATE_KEY),
  analyticsConfigured: Boolean(GA4_CLIENT_EMAIL && GA4_PRIVATE_KEY && NOEMA_ANALYTICS_PROJECTS),
});