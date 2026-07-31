import { config } from "../config.js";
import { listBuildingSites } from "../store/buildingsites.js";
import { listInspirations } from "../store/inspirations.js";
import { createGalleryShare, revokeGalleryShare, verifyGalleryShare } from "../store/share-tokens.js";
import { cookieValue, json, readJson, secureCookieSuffix } from "./http.js";

export const SHARE_COOKIE = "noema_gallery_share";

export function shareContext(req, url) {
  const token = url.searchParams.get("gallery") || cookieValue(req, SHARE_COOKIE);
  if (!token) return null;
  const share = verifyGalleryShare(token);
  return share ? { token, share } : { token, share: null };
}

export function shareAllows(share, pathname) {
  if (!share) return false;
  if (["/noema-header-footer.js", "/noema-i18n.js", "/build-version.json", "/favicon.ico", "/favicon.svg"].includes(pathname)) return true;
  if (share.scope === "galleries") {
    return ["/buildingsite", "/buildingsite/", "/buildingsite.html", "/inspiration", "/inspiration/", "/inspiration.html", "/buildingsite.js"].includes(pathname)
      || pathname === "/api/buildingsites" || pathname === "/api/inspirations"
      || pathname.startsWith("/buildingsite-files/") || pathname.startsWith("/inspiration-files/");
  }
  const page = share.scope === "buildingsite"
    ? ["/buildingsite", "/buildingsite/", "/buildingsite.html", "/buildingsite.js"]
    : ["/inspiration", "/inspiration/", "/inspiration.html"];
  if (page.includes(pathname)) return true;
  if (share.scope === "buildingsite" && pathname === "/api/buildingsites") return true;
  if (share.scope === "inspiration" && pathname === "/api/inspirations") return true;
  const fileMatch = pathname.match(/^\/(buildingsite|inspiration)-files\/([^/]+)\//);
  return Boolean(fileMatch && fileMatch[1] === share.scope && (!share.albumId || decodeURIComponent(fileMatch[2]) === share.albumId));
}

export function setShareCookie(res, context) {
  const maxAge = Math.max(0, Math.floor((context.share.expiresAt - Date.now()) / 1000));
  res.setHeader("Set-Cookie", `${SHARE_COOKIE}=${encodeURIComponent(context.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookieSuffix()}`);
}

export function filterSharedList(res, share) {
  if (share.scope === "galleries" || !share.albumId) return false;
  if (share.scope === "buildingsite") json(res, 200, { ok: true, buildingSites: listBuildingSites().filter((item) => item.id === share.albumId) });
  else json(res, 200, { ok: true, inspirations: listInspirations().filter((item) => item.id === share.albumId) });
  return true;
}

export async function handleShareAdmin(req, res, url, uiSession) {
  const pathname = url.pathname;
  if (pathname === "/api/gallery-share" && req.method === "POST") {
    if (config.uiAuthEnabled && !uiSession) { json(res, 401, { ok: false, error: "An administrator session is required." }); return true; }
    try {
      const contentLength = Number(req.headers["content-length"] || 0);
      const body = contentLength > 0 ? await readJson(req) : {};
      const scope = ["galleries", "buildingsite", "inspiration"].includes(body.scope) ? body.scope : "galleries";
      const albumId = String(body.albumId || "");
      if (albumId) {
        const exists = scope === "buildingsite"
          ? listBuildingSites().some((item) => item.id === albumId)
          : scope === "inspiration" && listInspirations().some((item) => item.id === albumId);
        if (!exists) throw Object.assign(new Error("Album not found."), { status: 404 });
      }
      const created = createGalleryShare({ scope, albumId, expiresInDays: body.expiresInDays });
      const initialPath = scope === "inspiration" ? "/inspiration" : "/buildingsite";
      const shareUrl = new URL(initialPath, config.PUBLIC_BASE_URL);
      shareUrl.searchParams.set("gallery", created.token);
      json(res, 201, { ok: true, id: created.share.id, scope, albumId, expiresAt: created.share.expiresAt, url: shareUrl.href });
    } catch (error) {
      json(res, error.status || 400, { ok: false, error: error.message });
    }
    return true;
  }
  const match = pathname.match(/^\/api\/gallery-share\/([^/]+)$/);
  if (match && req.method === "DELETE") {
    if (config.uiAuthEnabled && !uiSession) { json(res, 401, { ok: false, error: "An administrator session is required." }); return true; }
    const revoked = revokeGalleryShare(decodeURIComponent(match[1]));
    json(res, revoked ? 200 : 404, revoked ? { ok: true } : { ok: false, error: "Share link not found." });
    return true;
  }
  return false;
}
