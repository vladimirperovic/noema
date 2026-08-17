import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config.js";

/**
 * Keep legacy relative `data/` consumers aligned with NOEMA_DATA_DIR without
 * forcing the application source tree itself to live beside persistent data.
 */
export function prepareRuntimeDataRoot() {
  mkdirSync(config.DATA_DIR, { recursive: true, mode: 0o700 });
  const nativeData = path.resolve(process.cwd(), "data");
  if (nativeData === config.DATA_DIR) return process.cwd();

  const fingerprint = createHash("sha256").update(config.DATA_DIR).digest("hex").slice(0, 16);
  const runtimeRoot = path.join(os.tmpdir(), `noema-runtime-${fingerprint}`);
  const alias = path.join(runtimeRoot, "data");
  mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });

  if (existsSync(alias)) {
    const stat = lstatSync(alias);
    if (!stat.isSymbolicLink()) throw new Error(`Runtime data alias is not a symlink: ${alias}`);
    rmSync(alias, { force: true });
  }

  symlinkSync(config.DATA_DIR, alias, process.platform === "win32" ? "junction" : "dir");
  process.chdir(runtimeRoot);
  return runtimeRoot;
}
