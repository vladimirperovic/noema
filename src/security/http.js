import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const LOGIN_WINDOW_MS = 15 * 60_000;
const API_WINDOW_MS = 60_000;
const MAX_RATE_BUCKETS = 10_000;
const MAX_LOGIN_FAILURES_PER_IP = 5;
const loginByIp = new Map();
const apiByIp = new Map();

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cookieValue(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return ""; }
  }
  return "";
}

function normalizeIp(value) {
  const ip = String(value || "unknown").trim();
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export function clientIp(req) {
  const direct = normalizeIp(req.socket?.remoteAddress);
  if (!config.TRUSTED_PROXY_IPS.includes(direct)) return direct;
  return String(req.headers["x-forwarded-for"] || "").split(",").map(normalizeIp).find(Boolean) || direct;
}

export function applyClientIp(req, ip) {
  try { Object.defineProperty(req.socket, "remoteAddress", { configurable: true, value: ip }); } catch {}
}

export function secureCookieSuffix() {
  return config.PUBLIC_BASE_URL.startsWith("https://") ? "; Secure" : "";
}

export function json(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(payload);
}

export function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

export async function readBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, maxBytes) {
  try {
    const raw = await readBody(req, maxBytes);
    return raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

export function setSecurityHeaders(res) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "connect-src 'self' https://nominatim.openstreetmap.org https://www.googleapis.com https://oauth2.googleapis.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self' https://accounts.google.com",
    ].join("; "),
  };
  if (config.isProduction && config.PUBLIC_BASE_URL.startsWith("https://")) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  for (const [name, value] of Object.entries(headers)) if (!res.hasHeader(name)) res.setHeader(name, value);
  const original = res.writeHead.bind(res);
  res.writeHead = (...args) => {
    for (const [name, value] of Object.entries(headers)) if (!res.hasHeader(name)) res.setHeader(name, value);
    return original(...args);
  };
}

export function isBearerAuthorized(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") && Boolean(config.NOEMA_API_TOKEN) && safeEqual(header.slice(7).trim(), config.NOEMA_API_TOKEN);
}

function pruneBuckets(map, windowMs, now) {
  for (const [key, record] of map) {
    if (!record || now - record.since > windowMs) map.delete(key);
  }
  while (map.size > MAX_RATE_BUCKETS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function loginStatus(ip) {
  const now = Date.now();
  pruneBuckets(loginByIp, LOGIN_WINDOW_MS, now);
  const current = loginByIp.get(ip) || { count: 0, since: now };
  const locked = current.count >= MAX_LOGIN_FAILURES_PER_IP;
  return {
    locked,
    ipLocked: locked,
    globalLocked: false,
    remaining: Math.max(0, MAX_LOGIN_FAILURES_PER_IP - current.count),
  };
}

export function recordLoginFailure(ip) {
  const now = Date.now();
  pruneBuckets(loginByIp, LOGIN_WINDOW_MS, now);
  const record = loginByIp.get(ip);
  const next = !record || now - record.since > LOGIN_WINDOW_MS
    ? { count: 1, since: now }
    : { ...record, count: record.count + 1 };
  loginByIp.delete(ip);
  loginByIp.set(ip, next);
  return Math.max(0, MAX_LOGIN_FAILURES_PER_IP - next.count);
}

export function clearLoginFailure(ip) {
  loginByIp.delete(ip);
}

export function enforceApiRate(req, res, ip) {
  if (!req.url?.startsWith("/api/")) return false;
  const now = Date.now();
  pruneBuckets(apiByIp, API_WINDOW_MS, now);
  const record = apiByIp.get(ip);
  const next = !record || now - record.since > API_WINDOW_MS
    ? { count: 1, since: now }
    : { ...record, count: record.count + 1 };
  apiByIp.delete(ip);
  apiByIp.set(ip, next);
  if (next.count <= 300) return false;
  json(res, 429, { ok: false, error: "Too many requests." }, { "Retry-After": "60" });
  return true;
}
