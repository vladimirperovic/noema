import { config } from "./config.js";
import { createServer } from "./server.js";
import { installFileLibrary } from "./file-library.js";
import { installGalleryDownloads } from "./gallery-downloads.js";
import { installSecurityGateway } from "./security-gateway.js";
import { closeStore } from "./store/todos.js";
import { closeNotes } from "./store/notes.js";
import { closeDocuments } from "./store/documents.js";
import { closeLinks } from "./store/links.js";
import { closeInspirations } from "./store/inspirations.js";
import { closeBuildingSites } from "./store/buildingsites.js";
import { closeFiles } from "./store/files.js";
import { closeSessions } from "./store/sessions.js";
import { closeGalleryShares } from "./store/share-tokens.js";
import { closeSystem } from "./store/system.js";
import { closeDatabase } from "./store/database.js";
import { initCrypto } from "./store/crypto.js";

function main() {
  initCrypto(config.ENCRYPTION_KEY);
  const server = installSecurityGateway(
    installGalleryDownloads(
      installFileLibrary(createServer()),
    ),
  );

  server.listen(config.PORT, config.HOST, () => {
    console.log(`[noema] listening on http://${config.HOST}:${config.PORT} (env=${config.NODE_ENV}, auth=${config.authEnabled ? "on" : "off"})`);
    console.log(`[noema] UI:       ${config.PUBLIC_BASE_URL}/`);
    console.log(`[noema] OpenAPI:  ${config.PUBLIC_BASE_URL}/openapi.json`);
    console.log(`[noema] MCP:      ${config.PUBLIC_BASE_URL}/mcp`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[noema] received ${signal}, shutting down...`);
    closeStore();
    closeNotes();
    closeDocuments();
    closeLinks();
    closeInspirations();
    closeBuildingSites();
    closeFiles();
    closeSessions();
    closeGalleryShares();
    closeSystem();
    closeDatabase();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
