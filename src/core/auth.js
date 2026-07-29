import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

/**
 * Pomoćne funkcije za autentikaciju gateway-a (port iz keryx `core/auth.ts`).
 *
 * Model:
 *   - "gateway" alati traže NOEMA gateway token (NOEMA_API_TOKEN).
 *   - "forward" alati NE traže gateway token — caller token se prosleđuje dalje.
 *   - Ako je NOEMA_API_TOKEN prazan, autentifikacija je ISKLJUČENA (lokalni dev).
 */

/** Izvuci bearer token iz `Authorization` header-a. */
export function bearerFromHeader(header) {
  if (!header) return "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1].trim() : "";
}

/** Konstantno-vremensko poređenje tokena (otporno na timing napade). */
export function safeTokenEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Provera autentikacije za jedan poziv alata. Vraća poruku greške ili `null`
 * ako je pristup dozvoljen. Deli je REST sloj i MCP sloj.
 *
 * @param {import("./registry.js").ToolDefinition} tool
 * @param {string} callerToken
 * @returns {string | null}
 */
export function checkToolAuth(tool, callerToken) {
  if (tool.auth === "forward") {
    return callerToken ? null : "Nedostaje token (potreban za ovaj alat).";
  }
  if (!config.authEnabled) return null;
  if (!callerToken) return "Nedostaje ili neispravan gateway token.";
  return safeTokenEqual(callerToken, config.NOEMA_API_TOKEN)
    ? null
    : "Nedostaje ili neispravan gateway token.";
}
