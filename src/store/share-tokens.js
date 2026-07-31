import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { createCollection } from "./collection.js";

const SCOPES = new Set(["galleries", "buildingsite", "inspiration"]);
const tokenHash = (token) => createHash("sha256").update(String(token || "")).digest("hex");

function normalizeShare(raw) {
  const share = { ...raw };
  const now = Date.now();
  share.id = String(share.id || "");
  share.scope = SCOPES.has(share.scope) ? share.scope : "galleries";
  share.albumId = String(share.albumId || "");
  share.createdAt = Number.isFinite(share.createdAt) ? share.createdAt : now;
  share.updatedAt = Number.isFinite(share.updatedAt) ? share.updatedAt : share.createdAt;
  share.expiresAt = Number.isFinite(share.expiresAt) ? share.expiresAt : share.createdAt + config.GALLERY_SHARE_TTL_DAYS * 86_400_000;
  share.revokedAt = Number.isFinite(share.revokedAt) ? share.revokedAt : null;
  return share;
}

const shares = createCollection({
  name: "gallery-shares",
  legacyFile: "gallery-shares.json",
  normalize: normalizeShare,
  validate: (share) => Boolean(share && /^[0-9a-f]{64}$/.test(share.id)),
});

export function loadGalleryShares() { shares.load(); pruneGalleryShares(); }
export function createGalleryShare({ scope = "galleries", albumId = "", expiresInDays } = {}) {
  const safeScope = SCOPES.has(scope) ? scope : "galleries";
  const requested = Number(expiresInDays);
  const days = Number.isFinite(requested) ? Math.max(1, Math.min(365, Math.floor(requested))) : config.GALLERY_SHARE_TTL_DAYS;
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const share = shares.set(normalizeShare({ id: tokenHash(token), scope: safeScope, albumId, createdAt: now, updatedAt: now, expiresAt: now + days * 86_400_000, revokedAt: null }));
  return { token, share };
}
export function verifyGalleryShare(token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) return null;
  const share = shares.get(tokenHash(token));
  if (!share) return null;
  if (share.revokedAt || share.expiresAt <= Date.now()) { shares.remove(share.id); return null; }
  return share;
}
export function revokeGalleryShare(id) {
  const share = shares.get(String(id || ""));
  if (!share) return false;
  shares.set({ ...share, revokedAt: Date.now(), updatedAt: Date.now() });
  return true;
}
export function pruneGalleryShares(now = Date.now()) {
  let removed = 0;
  for (const share of shares.list()) if (share.revokedAt || share.expiresAt <= now) if (shares.remove(share.id)) removed++;
  return removed;
}
export function closeGalleryShares() { shares.close(); }
