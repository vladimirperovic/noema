import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { createCollection } from "./collection.js";

const TOUCH_INTERVAL_MS = 5 * 60_000;
const tokenHash = (token) => createHash("sha256").update(String(token || "")).digest("hex");
const authFingerprint = () => createHash("sha256").update(`ui-password:${config.UI_PASSWORD}`).digest("hex");

function normalizeSession(raw) {
  const session = { ...raw };
  const now = Date.now();
  session.id = String(session.id || "");
  session.createdAt = Number.isFinite(session.createdAt) ? session.createdAt : now;
  session.updatedAt = Number.isFinite(session.updatedAt) ? session.updatedAt : session.createdAt;
  session.lastSeenAt = Number.isFinite(session.lastSeenAt) ? session.lastSeenAt : session.createdAt;
  session.idleExpiresAt = Number.isFinite(session.idleExpiresAt) ? session.idleExpiresAt : session.lastSeenAt + config.SESSION_IDLE_TTL_MS;
  session.absoluteExpiresAt = Number.isFinite(session.absoluteExpiresAt) ? session.absoluteExpiresAt : session.createdAt + config.SESSION_ABSOLUTE_TTL_MS;
  session.authFingerprint = String(session.authFingerprint || "");
  return session;
}

const sessions = createCollection({
  name: "sessions",
  legacyFile: "sessions.json",
  normalize: normalizeSession,
  validate: (session) => Boolean(session && /^[0-9a-f]{64}$/.test(session.id)),
});

export function loadSessions() { sessions.load(); pruneSessions(); }
export function createSession() {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  sessions.set(normalizeSession({ id: tokenHash(token), createdAt: now, updatedAt: now, lastSeenAt: now, idleExpiresAt: now + config.SESSION_IDLE_TTL_MS, absoluteExpiresAt: now + config.SESSION_ABSOLUTE_TTL_MS, authFingerprint: authFingerprint() }));
  return token;
}
export function verifySession(token, { touch = true } = {}) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) return null;
  const id = tokenHash(token);
  const session = sessions.get(id);
  if (!session) return null;
  const now = Date.now();
  if (session.authFingerprint !== authFingerprint() || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
    sessions.remove(id);
    return null;
  }
  if (touch && now - session.lastSeenAt >= TOUCH_INTERVAL_MS) {
    return sessions.set(normalizeSession({ ...session, lastSeenAt: now, idleExpiresAt: Math.min(now + config.SESSION_IDLE_TTL_MS, session.absoluteExpiresAt), updatedAt: now }));
  }
  return session;
}
export function sessionBinding(token) { return verifySession(token, { touch: false }) ? tokenHash(token) : ""; }
export function revokeSession(token) { return typeof token === "string" && token ? sessions.remove(tokenHash(token)) : false; }
export function revokeAllSessions() { sessions.replace([]); }
export function pruneSessions(now = Date.now()) {
  let removed = 0;
  for (const session of sessions.list()) {
    if (session.authFingerprint !== authFingerprint() || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) if (sessions.remove(session.id)) removed++;
  }
  return removed;
}
export function closeSessions() { sessions.close(); }
