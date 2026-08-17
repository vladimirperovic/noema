import { config } from "./config.js";
import { loadSessions, verifySession } from "./store/sessions.js";
import { loadGalleryShares } from "./store/share-tokens.js";
import { handleAuthRoute, SESSION_COOKIE } from "./security/auth-routes.js";
import { handleBackupRoute } from "./security/backup-routes.js";
import { filterSharedList, handleShareAdmin, setShareCookie, shareAllows, shareContext } from "./security/share-routes.js";
import { applyClientIp, clientIp, cookieValue, enforceApiRate, isBearerAuthorized, json, redirect, setSecurityHeaders } from "./security/http.js";

const PUBLIC_UNAUTHENTICATED_PATHS = new Set([
  "/healthz",
  "/openapi.json",
  "/mcp",
  "/login",
  "/login/",
  "/login.html",
  "/sw.js",
  "/manifest.json",
  "/favicon.ico",
  "/favicon.svg",
  "/noema-i18n.js",
]);

function isPublicUnauthenticatedPath(pathname) {
  return PUBLIC_UNAUTHENTICATED_PATHS.has(pathname) || pathname.startsWith("/api/tools/");
}

function isPrivateDataPath(pathname) {
  return pathname.startsWith("/api/")
    || pathname.startsWith("/uploads/")
    || pathname.startsWith("/files/")
    || pathname.startsWith("/file/")
    || pathname.startsWith("/inspiration-files/")
    || pathname.startsWith("/buildingsite-files/")
    || pathname.startsWith("/thumbnails/")
    || pathname.startsWith("/private-assets/")
    || pathname.startsWith("/gallery-media/")
    || pathname.startsWith("/backup/");
}

function forceNoStore(res) {
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = (statusCode, statusMessageOrHeaders, maybeHeaders) => {
    const harden = (headers = {}) => ({ ...headers, "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" });
    if (typeof statusMessageOrHeaders === "string") return originalWriteHead(statusCode, statusMessageOrHeaders, harden(maybeHeaders));
    return originalWriteHead(statusCode, harden(statusMessageOrHeaders));
  };
}

function redirectToLogin(res, req) {
  const login = new URL("/login", config.PUBLIC_BASE_URL);
  login.searchParams.set("next", String(req.url || "/"));
  redirect(res, `${login.pathname}${login.search}`);
}

export function installSecurityGateway(server) {
  loadSessions();
  loadGalleryShares();
  const original = server.listeners("request")[0];
  if (!original) throw new Error("Noema request handler was not found.");
  server.removeAllListeners("request");
  server.on("request", async (req, res) => {
    setSecurityHeaders(res);
    const url = new URL(req.url, config.PUBLIC_BASE_URL);
    const pathname = url.pathname;
    if (isPrivateDataPath(pathname)) forceNoStore(res);

    if (String(req.headers.authorization || "").startsWith("Basic ")) delete req.headers.authorization;

    const ip = clientIp(req);
    applyClientIp(req, ip);
    const rawSessionToken = cookieValue(req, SESSION_COOKIE);
    const uiSession = config.uiAuthEnabled ? verifySession(rawSessionToken) : { id: "insecure-development-session" };
    const bearerAuthorized = isBearerAuthorized(req);
    const share = shareContext(req, url);
    const shareAllowed = Boolean(share?.share && ["GET", "HEAD"].includes(req.method) && shareAllows(share.share, pathname));
    const apiRateIdentity = uiSession?.id
      ? `session:${uiSession.id}`
      : bearerAuthorized
        ? "bearer:configured-token"
        : share?.share?.id
          ? `share:${share.share.id}`
          : `ip:${ip}`;
    if (enforceApiRate(req, res, apiRateIdentity)) return;

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

    const privileged = Boolean(uiSession || bearerAuthorized);
    if (config.uiAuthEnabled && !privileged && !shareAllowed && !isPublicUnauthenticatedPath(pathname)) {
      const wantsHtml = ["GET", "HEAD"].includes(req.method) && (pathname === "/" || String(req.headers.accept || "").includes("text/html"));
      if (wantsHtml) redirectToLogin(res, req);
      else json(res, 401, { ok: false, error: "Authentication required. Sign in at /login." });
      return;
    }

    req.noemaUiSession = uiSession || null;
    req.noemaPrivileged = privileged;
    req.noemaBearerAuthorized = bearerAuthorized;
    req.noemaGalleryShare = shareAllowed ? share.share : null;

    try {
      await original(req, res);
    } catch (error) {
      if (!res.headersSent) json(res, 500, { ok: false, error: "Internal server error." });
      else res.destroy(error);
    }
  });
  return server;
}
