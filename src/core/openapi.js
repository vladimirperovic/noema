/**
 * Gradi OpenAPI 3.1 dokument iz registra alata (port keryx `core/openapi.ts`).
 *
 * Ručno, bez biblioteke: registar je mali i pod našom kontrolom, pa je
 * deterministički generator čitljiviji i daje tačno onu šemu kakvu
 * Claude/ChatGPT "tool use" očekuje — svaki alat je jedan `POST` sa JSON telom.
 */

import { config } from "../config.js";

/** Putanja pod kojom se REST poziva jedan alat. */
export function toolHttpPath(name) {
  return `/api/tools/${name}`;
}

const SERVICE = { name: "noema", version: "0.1.0" };

export function buildOpenApiDocument(registry) {
  const paths = {};
  const schemas = {};
  const tags = new Set();

  for (const tool of registry.list()) {
    tags.add(tool.module);

    const requestSchemaName = pascal(tool.name) + "Request";
    schemas[requestSchemaName] = {
      type: "object",
      ...tool.input,
    };

    paths[toolHttpPath(tool.name)] = {
      post: {
        operationId: tool.name,
        summary: tool.title,
        description: tool.description,
        tags: [tool.module],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${requestSchemaName}` },
            },
          },
        },
        responses: {
          "200": {
            description: "Uspešno izvršenje alata.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [true] },
                    tool: { type: "string" },
                    result: {},
                  },
                  required: ["ok", "tool", "result"],
                },
                ...(tool.responseExample !== undefined
                  ? { example: { ok: true, tool: tool.name, result: tool.responseExample } }
                  : {}),
              },
            },
          },
          "400": {
            description: "Neispravan ulaz (greška validacije).",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
          "401": {
            description: "Nedostaje ili je neispravan API token.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
        },
      },
    };
  }

  schemas.ErrorResponse = {
    type: "object",
    properties: {
      ok: { type: "boolean", enum: [false] },
      error: { type: "string" },
      details: {},
    },
    required: ["ok", "error"],
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Noema AI Gateway",
      version: SERVICE.version,
      description:
        "Self-hosted todo gateway koji izlaže taskove (juče/danas/sjutra) LLM " +
        "agentima (Claude, ChatGPT) preko OpenAPI šeme i Model Context Protocol-a.",
    },
    servers: [{ url: config.PUBLIC_BASE_URL }],
    tags: [...tags].map((t) => ({ name: t })),
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Opcioni Noema API token (Authorization: Bearer <token>).",
        },
      },
    },
  };
}

function pascal(snake) {
  return snake
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
