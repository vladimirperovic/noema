import { config } from "./config.js";
import { loadSessions, verifySession } from "./store/sessions.js";
import { loadGalleryShares } from "./store/share-tokens.js";
import { handleAuthRoute, legacySessionToken, SESSION_COOKIE } from "./security/auth-routes.js";
import { handleBackupRoute } from "./security/backup-routes.js";
import { filterSharedList, handleShareAdmin, setShareCookie, shareAllows, shareContext, SHARE_COOKIE } from "./security/share-routes.js";
import { applyClientIp, clientIp, cookieValue, enforceApiRate, isBearerAuthorized, json, redirect, replaceCookieHeader, setSecurityHeaders } from "./security/http.js";

export function installSecurityGateway(server) {
  loadSessions();
  loadGalleryShares();
  const original = server.listeners("request")[0];
  if (!original) throw new Error("Noema request handler was not found.");
  server.removeAllListeners("request");
  server.on("request", async (req, res) => {
    setSecurityHeaders(res);
    const ip = clientIp(req);
    applyClientIp(req, ip);
    if (enforceApiRate(req, res, ip)) return;

    const url = new URL(req.url, config.PUBLIC_BASE_URL);
    const pathname = url.pathname;
    const rawSessionToken = cookieValue(req, SESSION_COOKIE);
    const uiSession = config.uiAuthEnabled ? verifySession(rawSessionToken) : { id: "insecure-development-session" };

    const share = shareContext(req, url);
    const shareAllowed = Boolean(share?.share && ["GET", "HEAD"].includes(req.method) && shareAllows(share.share, pathname));
    if (share?.token && !share?.share && !uiSession) {
      if (pathname.startsWith("/api/") || !String(req.headers.accept || "").includes("text/html")) json(res, 401, { ok: false, error: "The share link is invalid or expired." });
      else redirect(res, "/login");
      return;
    }
    if (share?.share && !shareAllowed && !uiSession) {
      json(res, 403, { ok: false, error: "This share link does not allow access to the requested path." });
      return;
    }
    if (share?.share && url.searchParams.has("gallery")) setShareCookie(res, share);

    if (await handleAuthRoute(req, res, url, ip, rawSessionToken, uiSession)) return;
    if (await handleShareAdmin(req, res, url, uiSession)) return;
    if (await handleBackupRoute(req, res, url, uiSession)) return;
    if (shareAllowed && pathname === "/api/buildingsites" && share.share.scope === "buildingsite" && filterSharedList(res, share.share)) return;
    if (shareAllowed && pathname === "/api/inspirations" && share.share.scope === "inspiration" && filterSharedList(res, share.share)) return;

    // Inner storage middleware receives authorization results only, never raw secrets.
    req.noemaUiSession = uiSession || null;
    req.noemaPrivileged = Boolean(uiSession || isBearerAuthorized(req));
    req.noemaGalleryShare = shareAllowed ? share.share : null;

    if (String(req.headers.authorization || "").startsWith("Basic ")) delete req.headers.authorization;
    replaceCookieHeader(req, {
      [SESSION_COOKIE]: (uiSession || shareAllowed) ? legacySessionToken() : null,
      [SHARE_COOKIE]: null,
    });

    try {
      await original(req, res);
    } catch (error) {
      if (!res.headersSent) json(res, 500, { ok: false, error: "Internal server error." });
      else res.destroy(error);
    }
  });
  return server;
}
