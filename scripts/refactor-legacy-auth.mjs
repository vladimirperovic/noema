import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../src/server.js", import.meta.url);
let source = readFileSync(file, "utf8");

function cutBetween(startMarker, endMarker, replacement = "") {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Could not locate refactor markers: ${startMarker} -> ${endMarker}`);
  }
  source = source.slice(0, start) + replacement + source.slice(end);
}

// Legacy gallery HMAC/cookie sharing is replaced by revocable share tokens in security-gateway.js.
cutBetween(
  'const GALLERY_SHARE_COOKIE = "noema_gallery_share";',
  'function reverseAddressLabel(result) {'
);

// Remove the inner browser-auth authority entirely: Basic Auth, HMAC sessions,
// duplicate login limiter and the old authorization helper.
cutBetween(
  '/**\n * Rute koje OSTAJU javne',
  '/** Pročitaj sirovo telo zahteva (Promise). */'
);

// The outer gateway now owns all browser/share authorization. The inner server
// should only receive an already-authorized request.
cutBetween(
  '    const galleryShareAccess = hasGalleryShareAccess(req, url);',
  '    try {',
  '    try {'
);

// Remove legacy login/logout handlers. /login GET remains a static-file alias;
// POST /login and logout are exclusively handled by security/auth-routes.js.
cutBetween(
  '      // --- Javne rute i rute za autentifikaciju ---',
  '      // Health check.',
  '      // Health check.'
);

// OAuth authorization/state validation is handled by security/auth-routes.js.
cutBetween(
  '      // --- Google OAuth connect flow',
  '      // MCP endpoint',
  '      // MCP endpoint'
);

// Remove the second API limiter. security/http.js is the single rate-limit authority.
cutBetween(
  '      // --- Rate limiting za sve /api/* rute ---',
  '      // --- REST za UI: /api/todos ---',
  '      // --- REST za UI: /api/todos ---'
);

source = source
  .replace('import { createHmac, randomUUID } from "node:crypto";', 'import { randomUUID } from "node:crypto";')
  .replace('import { bearerFromHeader, checkToolAuth, safeTokenEqual } from "./core/auth.js";', 'import { bearerFromHeader, checkToolAuth } from "./core/auth.js";')
  .replace('  buildAuthUrl,\n  handleOAuthCallback,\n', '');

for (const forbidden of [
  'WWW-Authenticate',
  'checkUiPassword',
  'createSessionToken',
  'verifySessionToken',
  'MAX_FAILED_LOGIN_ATTEMPTS',
  'Basic realm=',
  'ipRequestCounts',
  'galleryShareToken',
]) {
  if (source.includes(forbidden)) throw new Error(`Legacy auth residue remains: ${forbidden}`);
}

writeFileSync(file, source);
