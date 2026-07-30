import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function normalizeHostname(raw) {
  return String(raw || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function blockedIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

function blockedIpv6(raw) {
  const address = normalizeHostname(raw).split("%")[0];
  if (address === "::" || address === "::1") return true;
  // Block IPv4-mapped IPv6 completely. This avoids alternate encodings of
  // loopback, link-local, and RFC1918 addresses such as ::ffff:7f00:1.
  if (address.startsWith("::ffff:")) return true;
  return address.startsWith("fc") || address.startsWith("fd")
    || /^fe[89ab]/.test(address)
    || address.startsWith("ff")
    || address.startsWith("2001:db8:");
}

export function isPublicIp(rawAddress) {
  const address = normalizeHostname(rawAddress);
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
  const hostname = normalizeHostname(url.hostname);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".lan")) {
    throw new Error("Local and private network addresses are not allowed.");
  }
  if (isIP(hostname) && !isPublicIp(hostname)) throw new Error("Local and private network addresses are not allowed.");
  return url;
}

async function resolvePublicAddress(rawHostname) {
  const hostname = normalizeHostname(rawHostname);
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
    const hostname = normalizeHostname(url.hostname);
    const request = transport.request({
      protocol: url.protocol,
      hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: "GET",
      headers,
      servername: isIP(hostname) ? undefined : hostname,
      lookup(_hostname, options, callback) {
        if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
    }, (response) => {
      const declaredLength = Number(response.headers["content-length"] || 0);
      if (declaredLength > maxBytes) {
        response.destroy();
        reject(new Error("Response exceeds the " + maxBytes + "-byte limit."));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          response.destroy(new Error("Response exceeds the " + maxBytes + "-byte limit."));
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
