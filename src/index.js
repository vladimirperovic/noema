import { config } from "./config.js";
import { createServer } from "./server.js";
import { closeStore } from "./store/todos.js";
import { closeNotes } from "./store/notes.js";
import { closeDocuments } from "./store/documents.js";
import { closeLinks } from "./store/links.js";
import { closeInspirations } from "./store/inspirations.js";
import { closeBuildingSites } from "./store/buildingsites.js";
import { closeSystem } from "./store/system.js";
import { closeDatabase } from "./store/database.js";
import { initCrypto } from "./store/crypto.js";

function main() {
  initCrypto(config.ENCRYPTION_KEY);
  const server = createServer();

  server.listen(config.PORT, config.HOST, () => {
    console.log(
      `[noema] sluša na http://${config.HOST}:${config.PORT} ` +
        `(env=${config.NODE_ENV}, auth=${config.authEnabled ? "on" : "off"})`,
    );
    console.log(`[noema] UI:            ${config.PUBLIC_BASE_URL}/`);
    console.log(`[noema] OpenAPI šema:  ${config.PUBLIC_BASE_URL}/openapi.json`);
    console.log(`[noema] MCP endpoint:  ${config.PUBLIC_BASE_URL}/mcp`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[noema] primljen ${signal}, gasim server...`);
    closeStore();
    closeNotes();
    closeDocuments();
    closeLinks();
    closeInspirations();
    closeBuildingSites();
    closeSystem();
    closeDatabase();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
