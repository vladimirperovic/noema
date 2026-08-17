import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { addContact, getContact, listContacts, loadContacts, removeContact, updateContact } from "./store/contacts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const MAX_BODY = 512 * 1024;
let contactsLoaded = false;

function ensureContactsLoaded() {
  if (contactsLoaded) return;
  loadContacts();
  contactsLoaded = true;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

async function parseJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function verifyUiSession(req) {
  return Boolean(req.noemaUiSession);
}

async function handleApi(req, res, url) {
  if (!verifyUiSession(req)) {
    json(res, 401, { ok: false, error: "Sign in to Noema to access contacts." });
    return true;
  }
  ensureContactsLoaded();

  if (url.pathname === "/api/contacts" && req.method === "GET") {
    json(res, 200, { ok: true, contacts: listContacts() });
    return true;
  }
  if (url.pathname === "/api/contacts" && req.method === "POST") {
    try { json(res, 201, { ok: true, contact: addContact(await parseJson(req)) }); }
    catch (error) { json(res, error.status || 400, { ok: false, error: error.message }); }
    return true;
  }

  const match = url.pathname.match(/^\/api\/contacts\/([^/]+)$/);
  if (!match) return false;
  const id = decodeURIComponent(match[1]);
  if (req.method === "GET") {
    const contact = getContact(id);
    json(res, contact ? 200 : 404, contact ? { ok: true, contact } : { ok: false, error: "Contact not found." });
    return true;
  }
  if (req.method === "PATCH") {
    try {
      const contact = updateContact(id, await parseJson(req));
      json(res, contact ? 200 : 404, contact ? { ok: true, contact } : { ok: false, error: "Contact not found." });
    } catch (error) { json(res, error.status || 400, { ok: false, error: error.message }); }
    return true;
  }
  if (req.method === "DELETE") {
    const removed = removeContact(id);
    json(res, removed ? 200 : 404, removed ? { ok: true } : { ok: false, error: "Contact not found." });
    return true;
  }
  return false;
}

async function serveContactsPage(res) {
  const page = await readFile(path.join(PUBLIC_DIR, "contacts.html"));
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": page.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(page);
}

export function installContactLibrary(server) {
  const original = server.listeners("request")[0];
  if (!original) throw new Error("Noema request handler was not found.");
  server.removeAllListeners("request");
  server.on("request", async (req, res) => {
    try {
      const url = new URL(req.url, config.PUBLIC_BASE_URL);
      if ((url.pathname === "/contacts" || url.pathname === "/contacts/") && req.method === "GET" && verifyUiSession(req)) {
        await serveContactsPage(res);
        return;
      }
      if (url.pathname.startsWith("/api/contacts") && await handleApi(req, res, url)) return;
      return original(req, res);
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.message || "Internal server error." });
      else res.destroy(error);
    }
  });
  return server;
}
