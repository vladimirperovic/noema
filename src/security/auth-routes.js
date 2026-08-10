import { config } from "../config.js";
import { buildAuthUrl, handleOAuthCallback, isCalendarConfigured } from "../store/calendar.js";
import { protectCryptoWithPassword } from "../store/crypto.js";
import { assertDatabaseCryptoReadable } from "../store/database.js";
import { createSession, revokeSession, sessionBinding, verifySession } from "../store/sessions.js";
import { clearLoginFailure, json, loginStatus, readJson, recordLoginFailure, redirect, safeEqual, secureCookieSuffix } from "./http.js";

export const SESSION_COOKIE = "noema_session";

async function handleLogin(req, res, ip, sessionToken) {
  if (req.method === "GET") {
    if (verifySession(sessionToken)) redirect(res, "/");
    else return false;
    return true;
  }
  if (req.method !== "POST") return false;
  if (!config.uiAuthEnabled) { json(res, 200, { ok: true }); return true; }
  if (loginStatus(ip).locked) {
    json(res, 429, { ok: false, error: "Too many failed attempts. Try again in 15 minutes.", remainingAttempts: 0 }, { "Retry-After": "900", "Cache-Control": "no-store" });
    return true;
  }
  const body = await readJson(req);
  const password = body.password || body.UI_PASSWORD || "";
  if (!safeEqual(password, config.UI_PASSWORD)) {
    const remaining = recordLoginFailure(ip);
    json(res, remaining ? 401 : 429, { ok: false, error: remaining ? "Incorrect password." : "Maximum failed attempts reached.", remainingAttempts: remaining }, { "Cache-Control": "no-store" });
    return true;
  }

  try {
    assertDatabaseCryptoReadable();
    protectCryptoWithPassword(password);
  } catch (error) {
    console.error("[noema] Master-password migration failed:", error.message);
    json(res, 500, { ok: false, error: "Noema could not unlock encrypted storage with this master password." }, { "Cache-Control": "no-store" });
    return true;
  }

  clearLoginFailure(ip);
  const token = createSession();
  const maxAge = Math.floor(config.SESSION_ABSOLUTE_TTL_MS / 1000);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookieSuffix()}`);
  json(res, 200, { ok: true }, { "Cache-Control": "no-store" });
  return true;
}

export async function handleAuthRoute(req, res, url, ip, rawSessionToken, uiSession) {
  const pathname = url.pathname;
  if (pathname === "/login" && await handleLogin(req, res, ip, rawSessionToken)) return true;
  if ((pathname === "/logout" || pathname === "/api/logout") && ["GET", "POST"].includes(req.method)) {
    revokeSession(rawSessionToken);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieSuffix()}`);
    if (req.method === "GET") redirect(res, "/login");
    else json(res, 200, { ok: true }, { "Cache-Control": "no-store" });
    return true;
  }
  if (pathname === "/auth/google" && req.method === "GET") {
    if (config.uiAuthEnabled && !uiSession) { redirect(res, `/login?next=${encodeURIComponent(req.url)}`); return true; }
    if (!isCalendarConfigured()) { json(res, 400, { ok: false, error: "Calendar is not configured." }); return true; }
    const binding = config.uiAuthEnabled ? sessionBinding(rawSessionToken) : "insecure-development-session";
    redirect(res, buildAuthUrl(binding));
    return true;
  }
  if (pathname === "/auth/google/callback" && req.method === "GET") {
    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      redirect(res, oauthError === "access_denied" ? "/?calendar=denied" : `/?calendar=error&reason=${encodeURIComponent(oauthError)}`);
      return true;
    }
    if (config.uiAuthEnabled && !uiSession) { json(res, 401, { ok: false, error: "The OAuth callback requires an active administrator session." }); return true; }
    const binding = config.uiAuthEnabled ? sessionBinding(rawSessionToken) : "insecure-development-session";
    const result = await handleOAuthCallback(url.searchParams.get("code"), url.searchParams.get("state"), binding);
    redirect(res, result.ok ? "/?calendar=connected" : `/?calendar=error&reason=${encodeURIComponent(result.error || "unknown")}`);
    return true;
  }
  return false;
}
