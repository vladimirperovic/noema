import { todayISO, zonedDayBoundsUTC, resolveIsoDay } from "../core/utils.js";

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Google Calendar integracija — OAuth 2.0 Authorization Code flow, read-only.
 *
 * Tok:
 *   1. Korisnik postavi GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Google Cloud).
 *   2. Otvori /auth/google → preusmerava na Google "Allow" ekran.
 *   3. Google vrati `code` na /auth/google/callback → menjamo ga za
 *      refresh token (access_type=offline) i čuvamo u data/google-token.json.
 *   4. Od tada se access token osvežava po potrebi i kešira do isteka.
 *
 * Refresh token NIKAD ne ide u git (data/ je u .gitignore). GOOGLE_REFRESH_TOKEN
 * env varijabla je opcioni override (npr. token iz OAuth Playground-a).
 *
 * Bez eksternih dependency-ja — sve preko fetch-a i node:crypto.
 */

const DATA_DIR = config.DATA_DIR;
const TOKEN_FILE = path.join(DATA_DIR, "google-token.json");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedAccess = { token: "", expiresAt: 0 };
/** Aktivni OAuth `state` parametri (CSRF zaštita). state -> issuedAt. */
const pendingStates = new Map();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [s, t] of pendingStates) if (t < cutoff) pendingStates.delete(s);
}, 60_000).unref?.();

/** Da li su client kredencijali tu (može se pokrenuti OAuth). */
export function isCalendarConfigured() {
  return config.calendarConfigured;
}

/** Pročitaj sačuvani refresh token (env override ima prednost). */
function getRefreshToken() {
  if (config.GOOGLE_REFRESH_TOKEN) return config.GOOGLE_REFRESH_TOKEN;
  try {
    if (existsSync(TOKEN_FILE)) {
      const data = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
      if (data && typeof data.refresh_token === "string") return data.refresh_token;
    }
  } catch (err) {
    console.error("[noema] Ne mogu da pročitam Google token:", err.message);
  }
  return "";
}

/** Da li je kalendar povezan (postoji refresh token). */
export function isCalendarConnected() {
  return config.calendarConfigured && Boolean(getRefreshToken());
}

function saveRefreshToken(token) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: token, savedAt: Date.now() }, null, 2), "utf8");
}

// ── OAuth: korak 1 — napravi consent URL ───────────────────────────────────

/** Vrati Google consent URL i zapamti `state` radi CSRF provere. */
export function buildAuthUrl() {
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now());

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.GOOGLE_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline"); // → vraća refresh token
  url.searchParams.set("prompt", "consent"); // → uvek vrati refresh token
  url.searchParams.set("state", state);
  return url.toString();
}

// ── OAuth: korak 2 — zameni code za refresh token ──────────────────────────

/**
 * Obradi callback: proveri state, zameni `code` za tokene, sačuvaj refresh token.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function handleOAuthCallback(code, state) {
  if (!code) return { ok: false, error: "Nedostaje authorization code." };
  if (!state || !pendingStates.has(state)) {
    return { ok: false, error: "Neispravan ili istekao state (CSRF zaštita)." };
  }
  pendingStates.delete(state);

  const body = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    client_secret: config.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.GOOGLE_REDIRECT_URI,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `Google token exchange neuspešan (HTTP ${res.status}): ${txt}` };
  }

  const json = await res.json();
  if (!json.refresh_token) {
    return {
      ok: false,
      error: "Google nije vratio refresh token. Opozovi pristup na myaccount.google.com/permissions i pokušaj ponovo.",
    };
  }
  saveRefreshToken(json.refresh_token);
  // Iskoristi i odmah dobijeni access token (manje jedan poziv).
  if (json.access_token) {
    cachedAccess = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  }
  return { ok: true };
}

// ── Access token (refresh → access, keširan) ───────────────────────────────

let pendingTokenPromise = null;

async function getAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  const now = Date.now();
  if (cachedAccess.token && cachedAccess.expiresAt > now + 30_000) {
    return cachedAccess.token;
  }

  if (pendingTokenPromise) {
    return pendingTokenPromise;
  }

  pendingTokenPromise = (async () => {
    try {
      const body = new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        refresh_token: refresh,
        grant_type: "refresh_token",
      });

      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Google OAuth refresh neuspešan (HTTP ${res.status}): ${txt}`);
      }

      const json = await res.json();
      cachedAccess = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
      return cachedAccess.token;
    } finally {
      pendingTokenPromise = null;
    }
  })();

  return pendingTokenPromise;
}

// ── Čitanje događaja ───────────────────────────────────────────────────────

/**
 * Upit prema Google-u NAMERNO proširujemo za po jedan dan sa obe strane
 * (umesto uskog [ponoć, ponoć+1) opsega). Google interno poredi timeMin/timeMax
 * sa celodnevnim (all-day) događajima na način koji nije pouzdano dokumentovan
 * — u praksi je događaj i dalje "curio" u susedni dan i pored ispravno
 * izračunatih granica u zoni kalendara. Zato ovde samo tražimo širi opseg, a
 * TAČNO filtriranje po stvarnom kalendarskom danu radi `eventFallsOnDay` niže,
 * direktno na osnovu `e.start.date` (celodnevni) ili `e.start.dateTime`.
 */
function dayBounds(iso) {
  const prev = resolveIsoDay("yesterday", iso);
  const next = resolveIsoDay("tomorrow", iso);
  const { timeMin } = zonedDayBoundsUTC(prev, config.NOEMA_TIMEZONE);
  const { timeMax } = zonedDayBoundsUTC(next, config.NOEMA_TIMEZONE);
  return { timeMin, timeMax };
}

/** Da li događaj `e` pada na kalendarski dan `isoDay` (u zoni `timeZone`). */
function eventFallsOnDay(e, isoDay, timeZone) {
  if (e.start?.date) {
    // Celodnevni događaj: start.date/end.date su već goli kalendarski datumi,
    // bez vremenske zone — end.date je EKSKLUZIVNI kraj (dan posle poslednjeg dana).
    const end = e.end?.date || e.start.date;
    return e.start.date <= isoDay && isoDay < end;
  }
  if (e.start?.dateTime) {
    return todayISO(e.start.dateTime, timeZone) === isoDay;
  }
  return false;
}

/**
 * Dohvati događaje za zadati dan (default: danas).
 * `singleEvents=true` razvija ponavljajuće događaje u konkretne instance.
 * @param {string} [isoDay] YYYY-MM-DD
 * @returns {Promise<{ notConfigured?: boolean; notConnected?: boolean; events: Array<object> }>}
 */
export async function getCalendarEvents(isoDay = todayISO()) {
  if (!config.calendarConfigured) return { notConfigured: true, events: [] };

  const token = await getAccessToken();
  if (!token) return { notConnected: true, events: [] };

  const { timeMin, timeMax } = dayBounds(isoDay);
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.GOOGLE_CALENDAR_ID)}/events`,
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("timeZone", config.NOEMA_TIMEZONE);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Google Calendar API greška (HTTP ${res.status}): ${txt}`);
  }

  const json = await res.json();
  const events = (json.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .filter((e) => eventFallsOnDay(e, isoDay, config.NOEMA_TIMEZONE))
    .map((e) => ({
      id: e.id,
      title: e.summary || "(untitled)",
      start: e.start?.dateTime || e.start?.date || null,
      end: e.end?.dateTime || e.end?.date || null,
      location: e.location || null,
      htmlLink: e.htmlLink || null,
    }));

  return { events };
}
