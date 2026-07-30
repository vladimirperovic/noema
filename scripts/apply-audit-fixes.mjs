import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relative) {
  return readFile(path.join(root, relative), "utf8");
}

async function write(relative, content) {
  await writeFile(path.join(root, relative), content, "utf8");
}

function replaceOnce(content, from, to, label) {
  const index = content.indexOf(from);
  if (index < 0) throw new Error(`Could not find ${label}`);
  if (content.indexOf(from, index + from.length) >= 0) throw new Error(`Found multiple matches for ${label}`);
  return content.slice(0, index) + to + content.slice(index + from.length);
}

// 1) Build the real runtime English UI layer from the already-reviewed screenshot dictionary.
const screenshotSource = await read("scripts/capture-screenshots.mjs");
const dictionaryMatch = screenshotSource.match(/const screenshotTranslations = new Map\((\[[\s\S]*?\])\);\n\nasync function configureEnglishScreenshotPage/);
if (!dictionaryMatch) throw new Error("Could not extract the screenshot translation dictionary");
const dictionaryLiteral = dictionaryMatch[1];

const i18nSource = `/* Noema runtime English localization. Keeps user-created content unchanged. */
(() => {
  "use strict";

  const translations = new Map(${dictionaryLiteral});
  const extraTranslations = new Map([
    ["Servis za adrese trenutno nije dostupan.", "The address service is currently unavailable."],
    ["Naslov je obavezan.", "A title is required."],
    ["URL je obavezan.", "A URL is required."],
    ["Naziv je obavezan.", "A name is required."],
    ["Neispravan JSON format.", "Invalid JSON format."],
    ["Pristup zaštićen lozinkom. Prijavite se na /login", "Password-protected access. Log in at /login."],
    ["Interna greška servera.", "Internal server error."],
    ["Nije moguće automatski izvući tekst sa ove stranice.", "Text could not be extracted from this page automatically."],
    ["Nevažeći URL.", "Invalid URL."],
  ]);
  for (const [source, target] of extraTranslations) translations.set(source, target);

  const forceEnglishLocale = (locales) => {
    if (typeof locales === "string" && /^(sr|bs|hr|me)(-|$)/i.test(locales)) return "en-GB";
    if (Array.isArray(locales)) {
      const filtered = locales.filter((locale) => !(typeof locale === "string" && /^(sr|bs|hr|me)(-|$)/i.test(locale)));
      return filtered.length ? filtered : ["en-GB"];
    }
    return locales || "en-GB";
  };

  if (!window.__noemaEnglishLocalePatched) {
    window.__noemaEnglishLocalePatched = true;
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    const EnglishDateTimeFormat = function (locales, options) {
      return new OriginalDateTimeFormat(forceEnglishLocale(locales), options);
    };
    Object.setPrototypeOf(EnglishDateTimeFormat, OriginalDateTimeFormat);
    EnglishDateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
    Intl.DateTimeFormat = EnglishDateTimeFormat;

    for (const method of ["toLocaleDateString", "toLocaleString", "toLocaleTimeString"]) {
      const original = Date.prototype[method];
      Date.prototype[method] = function (locales, options) {
        return original.call(this, forceEnglishLocale(locales), options);
      };
    }
  }

  const replacements = Array.from(translations.entries())
    .sort((a, b) => b[0].length - a[0].length)
    .map(([source, target]) => ({
      target,
      pattern: new RegExp(\`(?<![\\p{L}\\p{N}])\${source.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&")}(?![\\p{L}\\p{N}])\`, "gu"),
    }));

  const USER_CONTENT_SELECTOR = [
    "[data-noema-i18n-skip]",
    "[contenteditable='true']",
    ".task-title", ".subtask-text", ".subtask-title",
    ".note-title", ".note-body", ".note-content",
    ".document-title", ".document-body", ".document-content", ".doc-title", ".doc-body",
    ".link-title", ".link-description", ".reader-content",
    ".inspiration-title", ".inspiration-address",
    ".site-title", ".site-address", ".site-location", ".hotspot-title",
    ".editor", ".editor-content", ".ProseMirror", ".ql-editor",
    "textarea:not([readonly])",
  ].join(",");

  function translate(value) {
    if (!value || typeof value !== "string") return value;
    let output = value;
    for (const { pattern, target } of replacements) output = output.replace(pattern, target);
    return output;
  }

  function isUserContent(element) {
    return Boolean(element && element.closest && element.closest(USER_CONTENT_SELECTOR));
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"].includes(parent.tagName) || isUserContent(parent)) return;
    const translated = translate(node.nodeValue);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    if (!isUserContent(element)) {
      for (const attribute of ["placeholder", "title", "aria-label", "alt"]) {
        if (!element.hasAttribute(attribute)) continue;
        const current = element.getAttribute(attribute);
        const translated = translate(current);
        if (translated !== current) element.setAttribute(attribute, translated);
      }
    }

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) translateTextNode(node);
  }

  function applyEnglishUi() {
    document.documentElement.lang = "en";
    document.title = translate(document.title);
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = translate(description.content);
    if (document.body) translateElement(document.body);
  }

  function start() {
    applyEnglishUi();
    if (!document.body) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
`;
await write("public/noema-i18n.js", i18nSource);

// 2) Protect OAuth initiation, complete metadata snapshots, and serve English HTML.
let server = await read("src/server.js");
server = replaceOnce(
  server,
  '    || pathname === "/buildingsite.js" || pathname === "/noema-header-footer.js" || pathname === "/favicon.ico"',
  '    || pathname === "/buildingsite.js" || pathname === "/noema-header-footer.js" || pathname === "/noema-i18n.js" || pathname === "/favicon.ico"',
  "public gallery asset list",
);
server = replaceOnce(
  server,
  ' * mašinski endpoint-i (MCP/OpenAPI/alati sa svojim bearer tokenom) i OAuth flow.\n',
  ' * machine endpoints (MCP/OpenAPI/tools with their own bearer token), login assets, and the OAuth callback.\n',
  "public route comment",
);
server = replaceOnce(
  server,
  '    p === "/logout" ||\n    p === "/auth/google" ||\n    p === "/auth/google/callback" ||',
  '    p === "/logout" ||\n    p === "/noema-i18n.js" ||\n    p === "/auth/google/callback" ||',
  "OAuth public route list",
);
server = replaceOnce(
  server,
  '          const links = listLinks();\n          const backup = {\n            version: 1,\n            exportedAt: new Date().toISOString(),\n            data: { todos, notes, documents, links }\n          };',
  '          const links = listLinks();\n          const buildingSites = listBuildingSites();\n          const inspirations = listInspirations();\n          const backup = {\n            version: 2,\n            scope: "metadata",\n            includesMedia: false,\n            exportedAt: new Date().toISOString(),\n            data: { todos, notes, documents, links, buildingSites, inspirations }\n          };',
  "snapshot creation payload",
);
server = replaceOnce(
  server,
  '          let restored = { todos: 0, notes: 0, documents: 0, links: 0 };',
  '          let restored = { todos: 0, notes: 0, documents: 0, links: 0, buildingSites: 0, inspirations: 0 };',
  "snapshot restore counters",
);
server = replaceOnce(
  server,
  '          if (b.data && Array.isArray(b.data.links)) {\n            replaceLinks(b.data.links);\n            restored.links = b.data.links.length;\n          }\n\n          return json(res, 200, { ok: true, restored });',
  '          if (b.data && Array.isArray(b.data.links)) {\n            replaceLinks(b.data.links);\n            restored.links = b.data.links.length;\n          }\n          if (b.data && Array.isArray(b.data.buildingSites)) {\n            replaceBuildingSites(b.data.buildingSites);\n            restored.buildingSites = b.data.buildingSites.length;\n          }\n          if (b.data && Array.isArray(b.data.inspirations)) {\n            replaceInspirations(b.data.inspirations);\n            restored.inspirations = b.data.inspirations.length;\n          }\n\n          return json(res, 200, { ok: true, restored });',
  "snapshot restore modules",
);
server = replaceOnce(
  server,
  '    const data = await readFile(filePath);\n    const ext = path.extname(filePath).toLowerCase();\n    setBaseHeaders(res, { "Content-Type": MIME[ext] || "application/octet-stream" });\n    res.writeHead(200, { "Cache-Control": "no-cache" });\n    res.end(data);',
  '    let data = await readFile(filePath);\n    const ext = path.extname(filePath).toLowerCase();\n    if (ext === ".html") {\n      let html = data.toString("utf8");\n      html = html.replace(/<html\\b([^>]*)>/i, (_match, attributes) => {\n        const clean = attributes.replace(/\\s+lang=(["\\\']).*?\\1/i, "");\n        return `<html${clean} lang="en">`;\n      });\n      if (!html.includes(\'/noema-i18n.js\')) {\n        html = html.replace(/<head\\b[^>]*>/i, (head) => `${head}\\n  <script src="/noema-i18n.js"></script>`);\n      }\n      data = Buffer.from(html, "utf8");\n    }\n    setBaseHeaders(res, { "Content-Type": MIME[ext] || "application/octet-stream" });\n    res.writeHead(200, { "Cache-Control": "no-cache" });\n    res.end(data);',
  "HTML localization injection",
);
await write("src/server.js", server);

// 3) Restrict all server-side link/article fetching to public HTTP(S) targets.
await write("src/core/outbound.js", `import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function blockedIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19));
}

function blockedIpv6(raw) {
  const address = raw.toLowerCase().split("%")[0];
  if (address === "::" || address === "::1") return true;
  if (address.startsWith("::ffff:")) {
    const mapped = address.slice("::ffff:".length);
    if (isIP(mapped) === 4) return blockedIpv4(mapped);
  }
  return address.startsWith("fc") || address.startsWith("fd")
    || /^fe[89ab]/.test(address)
    || address.startsWith("ff")
    || address.startsWith("2001:db8:");
}

export function isPublicIp(address) {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4(address);
  if (family === 6) return !blockedIpv6(address);
  return false;
}

export function validatePublicHttpUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http:// and https:// URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed.");
  const hostname = url.hostname.replace(/\\.$/, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".lan")) {
    throw new Error("Local and private network addresses are not allowed.");
  }
  if (isIP(hostname) && !isPublicIp(hostname)) throw new Error("Local and private network addresses are not allowed.");
  return url;
}

async function resolvePublicAddress(hostname) {
  if (isIP(hostname)) return { address: hostname, family: isIP(hostname) };
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !isPublicIp(record.address))) {
    throw new Error("The hostname resolves to a local or private network address.");
  }
  return records[0];
}

function requestText(url, target, { timeoutMs, maxBytes, headers }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers,
      servername: url.hostname,
      lookup(_hostname, options, callback) {
        if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
    }, (response) => {
      const declaredLength = Number(response.headers["content-length"] || 0);
      if (declaredLength > maxBytes) {
        response.destroy();
        reject(new Error(`Response exceeds the ${maxBytes}-byte limit.`));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          response.destroy(new Error(`Response exceeds the ${maxBytes}-byte limit.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        text: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });
    const timer = setTimeout(() => request.destroy(new Error("Outbound request timed out.")), timeoutMs);
    timer.unref?.();
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end();
  });
}

export async function safeFetchText(raw, { timeoutMs = 8000, maxBytes = 1024 * 1024, maxRedirects = 5, headers = {} } = {}) {
  let url = validatePublicHttpUrl(raw);
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const target = await resolvePublicAddress(url.hostname);
    const response = await requestText(url, target, { timeoutMs, maxBytes, headers });
    const location = response.headers.location;
    if (REDIRECT_STATUSES.has(response.status) && location) {
      if (redirects === maxRedirects) throw new Error("Too many redirects.");
      url = validatePublicHttpUrl(new URL(location, url).href);
      continue;
    }
    return {
      ...response,
      ok: response.status >= 200 && response.status < 300,
      url: url.href,
    };
  }
  throw new Error("Too many redirects.");
}
`);

let links = await read("src/store/links.js");
links = replaceOnce(
  links,
  'import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";',
  'import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";\nimport { safeFetchText } from "../core/outbound.js";',
  "safe outbound import",
);
links = links.replace(/export async function fetchArticleText\(url\) \{[\s\S]*?\n\}\n\n\/\*\*\n \* Pokuša da povuče OG metapodatke/, `export async function fetchArticleText(url) {
  const safe = normalizeUrl(url);
  if (!safe) return "Invalid URL.";

  try {
    const response = await safeFetchText(safe, {
      timeoutMs: 8000,
      maxBytes: 1024 * 1024,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Noema/0.1; self-hosted)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
      },
    });
    const type = String(response.headers["content-type"] || "").toLowerCase();
    if (!response.ok) throw new Error(`Remote server returned HTTP ${response.status}.`);
    if (type && !type.includes("html") && !type.includes("text/plain")) throw new Error("The URL did not return readable text or HTML.");

    const html = response.text;
    let contentMatch = html.match(/<article[^>]*>([\\s\\S]*?)<\\/article>/i);
    if (!contentMatch) contentMatch = html.match(/<main[^>]*>([\\s\\S]*?)<\\/main>/i);
    if (!contentMatch) contentMatch = html.match(/<body[^>]*>([\\s\\S]*?)<\\/body>/i);

    let text = contentMatch ? contentMatch[1] : html;
    text = text.replace(/<(script|style|svg|nav|footer|header|aside|button|form|iframe)[^>]*>[\\s\\S]*?<\\/\\1>/gi, "");
    text = text.replace(/<\\/(p|div|h[1-6]|li|blockquote|br)>/gi, "\\n\\n");
    text = text.replace(/<br[^>]*>/gi, "\\n");
    text = text.replace(/<[^>]+>/g, " ");
    text = decodeEntities(text);
    text = text.replace(/[ \\t]+/g, " ").replace(/\\n[ \\t]+/g, "\\n").replace(/\\n{3,}/g, "\\n\\n").trim();
    return text || "Text could not be extracted from this page automatically.";
  } catch (err) {
    return "Unable to download the article: " + err.message;
  }
}

/**
 * Pokuša da povuče OG metapodatke`);
links = links.replace(/export async function fetchPageMeta\(url\) \{[\s\S]*?\n\}\n\n\/\*\*\n \* Centralna logika čuvanja/, `export async function fetchPageMeta(url) {
  const empty = { title: "", description: "", image: "" };
  const safe = normalizeUrl(url);
  if (!safe) return empty;
  try {
    const response = await safeFetchText(safe, {
      timeoutMs: OG_TIMEOUT_MS,
      maxBytes: OG_MAX_BYTES,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Noema/0.1; self-hosted)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const type = String(response.headers["content-type"] || "").toLowerCase();
    if (!response.ok || !type.includes("html")) return empty;
    const html = response.text;
    let title = metaContent(html, "og:title") || decodeEntities((html.match(/<title[^>]*>([^<]*)<\\/title>/i)?.[1] || "").trim());
    const junkTitles = [
      "redirecting", "redirecting...", "just a moment...", "just a moment",
      "log in", "log into facebook", "login", "attention required",
      "please wait", "loading", "loading...", "verify",
    ];
    if (title && junkTitles.includes(title.toLowerCase().replace(/[.\\u2026]+$/, "").trim())) title = "";
    const description = metaContent(html, "og:description") || metaContent(html, "description");
    let image = metaContent(html, "og:image") || metaContent(html, "twitter:image");
    if (image && !/^https?:\\/\\//i.test(image)) {
      try { image = new URL(image, response.url).href; } catch { image = ""; }
    }
    return { title, description, image };
  } catch {
    return empty;
  }
}

/**
 * Centralna logika čuvanja`);
await write("src/store/links.js", links);

// 4) Make recurring-task weekday selection use the configured timezone.
let utils = await read("src/core/utils.js");
utils += `

/** Return the weekday key (sun..sat) in the configured timezone. */
export function weekdayKey(d = Date.now(), timeZone = config.NOEMA_TIMEZONE) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(d)).toLowerCase();
  const keys = { sun: "sun", mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat" };
  if (!keys[label]) throw new Error(`Unable to resolve weekday for timezone ${timeZone}.`);
  return keys[label];
}
`;
await write("src/core/utils.js", utils);

let todos = await read("src/store/todos.js");
todos = replaceOnce(todos, 'import { todayISO } from "../core/utils.js";', 'import { todayISO, weekdayKey } from "../core/utils.js";', "weekday import");
todos = replaceOnce(
  todos,
  '    { title: "Pregledati pull requestove", day: "yesterday", priority: "high", done: true },\n    { title: "Poslati izveštaj klijentu", day: "yesterday", priority: "normal", done: false },\n    { title: "Sastanak sa timom u 10h", day: "today", priority: "high", done: false },\n    { title: "Pročitati MCP specifikaciju", day: "today", priority: "low", done: false },\n    { title: "Pripremiti demo za klijenta", day: "tomorrow", priority: "high", done: false },',
  '    { title: "Review pull requests", day: "yesterday", priority: "high", done: true },\n    { title: "Send the report to the client", day: "yesterday", priority: "normal", done: false },\n    { title: "Team meeting at 10:00", day: "today", priority: "high", done: false },\n    { title: "Read the MCP specification", day: "today", priority: "low", done: false },\n    { title: "Prepare a demo for the client", day: "tomorrow", priority: "high", done: false },',
  "English demo tasks",
);
todos = replaceOnce(
  todos,
  'export function generateRecurring() {\n  const today = todayISO();\n  const dow = new Date().getDay();\n  const dayName = REPEAT_DAYS[dow];',
  'export function generateRecurring(now = Date.now()) {\n  const today = todayISO(now);\n  const dayName = weekdayKey(now);',
  "timezone-aware recurring tasks",
);
await write("src/store/todos.js", todos);

// 5) Tests and standard check coverage.
await write("test/outbound.test.js", `import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIp, safeFetchText, validatePublicHttpUrl } from "../src/core/outbound.js";

test("outbound URL validation rejects local and private targets", async () => {
  for (const value of [
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "ftp://example.com/file",
    "https://user:pass@example.com/",
  ]) {
    assert.throws(() => validatePublicHttpUrl(value));
  }
  await assert.rejects(() => safeFetchText("http://127.0.0.1/"), /private network/i);
});

test("public address classification and URL normalization", () => {
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("10.0.0.1"), false);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(validatePublicHttpUrl("https://example.com/a").href, "https://example.com/a");
});
`);

await write("test/utils-timezone.test.js", `import test from "node:test";
import assert from "node:assert/strict";
import { todayISO, weekdayKey } from "../src/core/utils.js";

test("weekdayKey follows the configured timezone at UTC date boundaries", () => {
  const instant = Date.parse("2026-01-01T00:30:00Z");
  assert.equal(todayISO(instant, "UTC"), "2026-01-01");
  assert.equal(weekdayKey(instant, "UTC"), "thu");
  assert.equal(todayISO(instant, "America/Los_Angeles"), "2025-12-31");
  assert.equal(weekdayKey(instant, "America/Los_Angeles"), "wed");
});
`);

await write("test/server-audit-fixes.test.js", `import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "src", "index.js");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server did not become healthy");
}

test("OAuth initiation is protected, English UI assets are public, and snapshots cover all metadata modules", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "noema-audit-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const token = "test-api-token";
  const child = spawn(process.execPath, [entry], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      PUBLIC_BASE_URL: base,
      NODE_ENV: "test",
      NOEMA_TIMEZONE: "UTC",
      NOEMA_CORS_ORIGIN: base,
      NOEMA_API_TOKEN: token,
      UI_PASSWORD: "test-password",
      ENCRYPTION_KEY: "test-encryption-key",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
    },
  });

  try {
    await waitFor(`${base}/healthz`, child);

    const oauth = await fetch(`${base}/auth/google`, { redirect: "manual", headers: { Accept: "text/html" } });
    assert.equal(oauth.status, 302);
    assert.match(oauth.headers.get("location"), /^\/login\?next=/);

    const callback = await fetch(`${base}/auth/google/callback?error=access_denied`, { redirect: "manual" });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "/?calendar=denied");

    const i18n = await fetch(`${base}/noema-i18n.js`);
    assert.equal(i18n.status, 200);
    assert.match(await i18n.text(), /USER_CONTENT_SELECTOR/);

    const home = await fetch(`${base}/`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<html[^>]*lang="en"/i);
    assert.match(html, /<script src="\/noema-i18n\.js"><\/script>/);

    const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const snapshotResponse = await fetch(`${base}/api/backup/snapshot`, { method: "POST", headers: authHeaders, body: "{}" });
    assert.equal(snapshotResponse.status, 200);
    const { filename } = await snapshotResponse.json();
    const snapshotPath = path.join(cwd, "data", "snapshots", filename);
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    assert.equal(snapshot.scope, "metadata");
    assert.equal(snapshot.includesMedia, false);
    assert.ok(Array.isArray(snapshot.data.buildingSites));
    assert.ok(Array.isArray(snapshot.data.inspirations));

    snapshot.data.buildingSites = [{ id: "site-1", title: "Test site", images: [], createdAt: 1, updatedAt: 1 }];
    snapshot.data.inspirations = [{ id: "inspiration-1", title: "Test inspiration", images: [], createdAt: 1, updatedAt: 1 }];
    await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

    const restore = await fetch(`${base}/api/backup/restore-snapshot`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ filename }),
    });
    assert.equal(restore.status, 200);
    const restored = (await restore.json()).restored;
    assert.equal(restored.buildingSites, 1);
    assert.equal(restored.inspirations, 1);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(cwd, { recursive: true, force: true });
  }
});
`);

let packageJson = JSON.parse(await read("package.json"));
packageJson.scripts.check = "node --check src/index.js && node --check src/server.js && node --check src/core/outbound.js && node --check src/services/analytics.js && node --check public/noema-i18n.js && node --check scripts/capture-screenshots.mjs && node --test test/*.test.js";
await write("package.json", JSON.stringify(packageJson, null, 2) + "\n");

let readme = await read("README.md");
readme = replaceOnce(
  readme,
  "Screenshots are generated from neutral demo data by `scripts/capture-screenshots.mjs`. They never use the contents of a personal `data/` directory.",
  "The public application is served in English. `public/noema-i18n.js` localizes interface chrome and date formatting while explicitly excluding task titles, notes, documents, links, and other user-created content. Screenshots are generated from neutral demo data by `scripts/capture-screenshots.mjs`; they never use a personal `data/` directory.",
  "README localization note",
);
readme = replaceOnce(
  readme,
  "Backup provides JSON export/import, archive downloads, local snapshots, storage statistics, and snapshot restore. Application data and uploaded media live in the local `data/` directory, which is excluded from Git.",
  "Backup provides JSON export/import, archive downloads, local metadata snapshots, storage statistics, and snapshot restore. Metadata snapshots cover every structured module but intentionally exclude uploaded media; use the full ZIP archive for a complete media backup. Application data and uploaded media live in the local `data/` directory, which is excluded from Git.",
  "README snapshot clarification",
);
await write("README.md", readme);

// The migration and its temporary workflow must not remain in the finished branch.
await rm(path.join(root, "scripts", "apply-audit-fixes.mjs"), { force: true });
await rm(path.join(root, ".github", "workflows", "apply-audit-fixes.yml"), { force: true });
