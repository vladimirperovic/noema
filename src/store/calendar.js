import { todayISO, zonedDayBoundsUTC, resolveIsoDay } from "../core/utils.js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";

const TOKEN_FILE = path.join(config.DATA_DIR, "google-token.enc");
const LEGACY_TOKEN_FILE = path.join(config.DATA_DIR, "google-token.json");
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
let cachedAccess = { token: "", expiresAt: 0 };
const pendingStates = new Map();

setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [state, value] of pendingStates) if (!value || value.issuedAt < cutoff) pendingStates.delete(state);
}, 60_000).unref?.();

export function isCalendarConfigured() { return config.calendarConfigured; }
function saveRefreshToken(token) { writeEncryptedJson(TOKEN_FILE, { refresh_token: token, savedAt: Date.now() }); }
function getRefreshToken() {
  if (config.GOOGLE_REFRESH_TOKEN) return config.GOOGLE_REFRESH_TOKEN;
  try {
    if (existsSync(TOKEN_FILE)) {
      const data = readEncryptedJson(TOKEN_FILE, null, { throwOnError: true });
      if (data && typeof data.refresh_token === "string") return data.refresh_token;
    }
    if (existsSync(LEGACY_TOKEN_FILE)) {
      const legacy = JSON.parse(readFileSync(LEGACY_TOKEN_FILE, "utf8"));
      if (legacy && typeof legacy.refresh_token === "string") {
        saveRefreshToken(legacy.refresh_token);
        unlinkSync(LEGACY_TOKEN_FILE);
        console.log("[noema] migrated the Google refresh token to encrypted storage.");
        return legacy.refresh_token;
      }
    }
  } catch (error) {
    console.error("[noema] could not read the Google token:", error.message);
  }
  return "";
}
export function isCalendarConnected() { return config.calendarConfigured && Boolean(getRefreshToken()); }

export function buildAuthUrl(sessionBinding) {
  if (!sessionBinding) throw new Error("Connecting OAuth requires an administrator session.");
  const state = randomBytes(32).toString("hex");
  pendingStates.set(state, { issuedAt: Date.now(), sessionBinding });
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.GOOGLE_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function handleOAuthCallback(code, state, sessionBinding) {
  if (!code) return { ok: false, error: "The authorization code is missing." };
  const pending = state ? pendingStates.get(state) : null;
  pendingStates.delete(state);
  if (!pending || !sessionBinding || pending.sessionBinding !== sessionBinding || Date.now() - pending.issuedAt > 10 * 60_000) {
    return { ok: false, error: "The OAuth state is invalid, expired, or belongs to another session." };
  }
  const body = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: config.GOOGLE_REDIRECT_URI });
  const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(8000) });
  if (!response.ok) return { ok: false, error: `Google token exchange failed (HTTP ${response.status}).` };
  const result = await response.json();
  if (!result.refresh_token) return { ok: false, error: "Google did not return a refresh token. Revoke the existing grant and try again." };
  saveRefreshToken(result.refresh_token);
  if (result.access_token) cachedAccess = { token: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  return { ok: true };
}

let pendingTokenPromise = null;
async function getAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  if (cachedAccess.token && cachedAccess.expiresAt > Date.now() + 30_000) return cachedAccess.token;
  if (pendingTokenPromise) return pendingTokenPromise;
  pendingTokenPromise = (async () => {
    try {
      const body = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" });
      const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Google OAuth refresh failed (HTTP ${response.status}).`);
      const result = await response.json();
      cachedAccess = { token: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
      return cachedAccess.token;
    } finally { pendingTokenPromise = null; }
  })();
  return pendingTokenPromise;
}

function dayBounds(iso) {
  const prev = resolveIsoDay("yesterday", iso);
  const next = resolveIsoDay("tomorrow", iso);
  const { timeMin } = zonedDayBoundsUTC(prev, config.NOEMA_TIMEZONE);
  const { timeMax } = zonedDayBoundsUTC(next, config.NOEMA_TIMEZONE);
  return { timeMin, timeMax };
}
function eventFallsOnDay(event, isoDay, timeZone) {
  if (event.start?.date) return event.start.date <= isoDay && isoDay < (event.end?.date || event.start.date);
  return event.start?.dateTime ? todayISO(event.start.dateTime, timeZone) === isoDay : false;
}
export async function getCalendarEvents(isoDay = todayISO()) {
  if (!config.calendarConfigured) return { notConfigured: true, events: [] };
  const token = await getAccessToken();
  if (!token) return { notConnected: true, events: [] };
  const { timeMin, timeMax } = dayBounds(isoDay);
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.GOOGLE_CALENDAR_ID)}/events`);
  url.searchParams.set("timeMin", timeMin); url.searchParams.set("timeMax", timeMax); url.searchParams.set("singleEvents", "true"); url.searchParams.set("orderBy", "startTime"); url.searchParams.set("maxResults", "50"); url.searchParams.set("timeZone", config.NOEMA_TIMEZONE);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Google Calendar API failed (HTTP ${response.status}).`);
  const result = await response.json();
  return { events: (result.items ?? []).filter((event) => event.status !== "cancelled").filter((event) => eventFallsOnDay(event, isoDay, config.NOEMA_TIMEZONE)).map((event) => ({ id: event.id, title: event.summary || "(untitled)", start: event.start?.dateTime || event.start?.date || null, end: event.end?.dateTime || event.end?.date || null, location: event.location || null, htmlLink: event.htmlLink || null })) };
}
