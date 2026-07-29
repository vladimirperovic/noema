/**
 * Deljeni registar alata — JEDINI izvor istine.
 *
 * Ovo je vanilla-JS port the reference implementation `ToolRegistry` obrasca. Svaki alat se definiše
 * JEDNOM (ime, opis, JSON-schema ulaza, handler), a iz njega se automatski
 * generišu: OpenAPI šema, MCP tool lista i REST ruta. Nikada se ne mogu razići.
 *
 * Za razliku od the reference implementation (Zod), ovde je input schema običan JSON-Schema objekat
 * (OpenAPI-compatible), jer nemamo Zod dependency. Validacija se radi preko
 * minimalnog `validateBySchema` helpera u `core/validate.js`.
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name - Mašinski naziv (snake_case).
 * @property {string} title - Čitljiv naslov za ljude / LLM UI.
 * @property {string} description - Šta operacija radi (LLM ga čita).
 * @property {string} module - Modul koji je registrovao alat ("nextgen"...).
 * @property {"gateway"|"forward"} [auth] - Model autentikacije.
 * @property {object} input - JSON-Schema ulaznih parametara.
 * @property {*} [responseExample] - Primer uspešnog odgovora (za OpenAPI).
 * @property {(input: any, ctx: ToolContext) => (unknown|Promise<unknown>)} handler
 */

/**
 * @typedef {Object} ToolContext
 * @property {string} baseUrl - Bazni javni URL gateway-a.
 * @property {string} [callerToken] - Bearer token pozivaoca (per-zahtev).
 */

export class ToolRegistry {
  constructor() {
    /** @type {Map<string, ToolDefinition>} */
    this.tools = new Map();
  }

  /**
   * Registruje alat. Imena moraju biti jedinstvena — duplikat je programerska
   * greška i prijavljuje se.
   * @param {ToolDefinition} tool
   */
  register(tool) {
    if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
      throw new Error(
        `[noema] Neispravno ime alata "${tool.name}". Dozvoljeno: snake_case ([a-z0-9_], počinje slovom).`,
      );
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`[noema] Alat "${tool.name}" je već registrovan. Imena moraju biti jedinstvena.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** @param {string} name */
  get(name) {
    return this.tools.get(name);
  }

  list() {
    return [...this.tools.values()];
  }
}

/** Deljena singleton instanca. */
export const registry = new ToolRegistry();
