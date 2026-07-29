/**
 * Minimalan MCP (Model Context Protocol) server — Streamable HTTP, stateless.
 *
 * Port keryx obrasca, ali bez `@modelcontextprotocol/sdk` dependency-ja.
 * Implementiramo samo JSON-RPC 2.0 poruke koje MCP klijenti (Claude Desktop,
 * ChatGPT) koriste za tool discovery i tool call:
 *
 *   initialize  → capabilities + server info
 *   tools/list  → lista alata iz registra (sa inputSchema)
 *   tools/call  → izvrši alat po imenu sa argumentima
 *
 * Stateless: svaki HTTP zahtev je nezavisan (kao keryx). GET/DELETE na /mcp
 * vraćaju 405 (nemaju smisla u stateless režimu).
 */

import { validateBySchema } from "./validate.js";
import { checkToolAuth } from "./auth.js";

const PROTOCOL_VERSION = "2025-06-18";

const SERVER_INFO = {
  name: "noema",
  version: "0.1.0",
};

const CAPABILITIES = {
  tools: {},
};

/**
 * Rukuje jednim JSON-RPC zahtevom (ili batch-om). Vraća odgovor (ili niz za
 * batch) koji se šalje klijentu.
 *
 * @param {unknown} body
 * @param {import("./registry.js").ToolContext} ctx
 * @param {import("./registry.js").ToolRegistry} registry
 */
export async function handleMcpRequest(body, ctx, registry) {
  // Batch (niz) — obradi svaki i vrati niz (preskoči notifikacije bez id).
  if (Array.isArray(body)) {
    const out = [];
    for (const item of body) {
      const r = await handleOne(item, ctx, registry);
      if (r !== null) out.push(r);
    }
    return out;
  }
  return handleOne(body, ctx, registry);
}

async function handleOne(req, ctx, registry) {
  // Minimalno JSON-RPC 2.0 validiranje.
  if (!req || typeof req !== "object" || req.jsonrpc !== "2.0") {
    return rpcError(req && req.id, -32600, "Neispravan JSON-RPC zahtev.");
  }
  const id = req.id ?? null;
  const method = req.method;
  const params = req.params ?? {};

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: CAPABILITIES,
            serverInfo: SERVER_INFO,
          },
        };

      case "notifications/initialized":
        // Notifikacija (bez id) — potvrda klijenta da je initialized. Bez odgovora.
        return req.id === undefined ? null : { jsonrpc: "2.0", id, result: {} };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: registry.list().map((t) => ({
              name: t.name,
              title: t.title,
              description: t.description,
              inputSchema: { type: "object", ...t.input },
            })),
          },
        };

      case "tools/call": {
        const name = params.name;
        const args = params.arguments ?? {};
        const tool = registry.get(name);
        if (!tool) {
          return rpcError(id, -32602, `Alat "${name}" ne postoji.`);
        }

        // Auth po alatu (isto kao REST sloj).
        const authError = checkToolAuth(tool, ctx.callerToken ?? "");
        if (authError) {
          return toolCallResult(id, authError, true);
        }

        // Validacija ulaza po JSON-schema.
        const parsed = validateBySchema(tool.input, args);
        if (!parsed.ok) {
          return toolCallResult(id, "Neispravan ulaz: " + parsed.errors.join(" "), true);
        }

        const result = await tool.handler(parsed.value, ctx);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: { ok: true, tool: tool.name, result },
          },
        };
      }

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      default:
        return rpcError(id, -32601, `Metod "${method}" nije podržan.`);
    }
  } catch (err) {
    console.error(`[noema] MCP greška u "${method}":`, err);
    return rpcError(id, -32603, "Interna greška servera.");
  }
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolCallResult(id, text, isError) {
  return {
    jsonrpc: "2.0",
    id,
    result: { content: [{ type: "text", text }], isError: !!isError },
  };
}

/** 405 odgovor za GET/DELETE na /mcp (stateless režim). */
export function mcpMethodNotAllowed(res) {
  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method Not Allowed (stateless server)." },
    id: null,
  }));
}
