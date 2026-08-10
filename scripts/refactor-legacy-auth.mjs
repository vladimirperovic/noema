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

cutBetween(
  'const GALLERY_SHARE_COOKIE = "noema_gallery_share";',
  'function reverseAddressLabel(result) {'
);

cutBetween(
  '/**\n * Rute koje OSTAJU javne',
  '/** Pročitaj sirovo telo zahteva (Promise). */'
);

// Preserve the existing try block; remove only the legacy authorization preamble.
cutBetween(
  '    const galleryShareAccess = hasGalleryShareAccess(req, url);',
  '    try {'
);

cutBetween(
  '      // --- Javne rute i rute za autentifikaciju ---',
  '      // Health check.',
  '      // Health check.'
);

cutBetween(
  '      // --- Google OAuth connect flow',
  '      // MCP endpoint',
  '      // MCP endpoint'
);

cutBetween(
  '      // --- Rate limiting za sve /api/* rute ---',
  '      // --- REST za UI: /api/todos ---',
  '      // --- REST za UI: /api/todos ---'
);

cutBetween(
  '      if (pathname === "/api/gallery-share" && method === "POST") {',
  '      // --- Inspiration galerija ---',
  '      // --- Inspiration galerija ---'
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
  '/api/gallery-share"',
]) {
  if (source.includes(forbidden)) throw new Error(`Legacy auth residue remains: ${forbidden}`);
}

writeFileSync(file, source);
