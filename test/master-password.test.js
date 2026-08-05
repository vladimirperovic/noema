import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function runModule(code, env) {
  return execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", ALLOW_INSECURE_NO_AUTH: "true", ...env },
    encoding: "utf8",
  });
}

test("legacy ENCRYPTION_KEY migrates to the login master password without re-encrypting data", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "noema-master-password-"));
  const legacyPassword = "legacy-storage-secret-for-test";
  const masterPassword = "single-login-master-password-for-test";

  try {
    runModule(`
      import path from "node:path";
      import { initCrypto, writeEncryptedJson } from "./src/store/crypto.js";
      initCrypto({ masterPassword: "", legacyPassword: process.env.ENCRYPTION_KEY });
      writeEncryptedJson(path.join(process.env.NOEMA_DATA_DIR, "probe.json"), [{ id: "probe", value: 42 }]);
    `, {
      NOEMA_DATA_DIR: dataDir,
      UI_PASSWORD: "",
      ENCRYPTION_KEY: legacyPassword,
    });

    assert.match(readFileSync(path.join(dataDir, "master.key"), "utf8"), /^v2:salt:/);

    runModule(`
      import { initCrypto, protectCryptoWithPassword } from "./src/store/crypto.js";
      initCrypto({ masterPassword: process.env.UI_PASSWORD, legacyPassword: process.env.ENCRYPTION_KEY });
      protectCryptoWithPassword(process.env.UI_PASSWORD);
    `, {
      NOEMA_DATA_DIR: dataDir,
      UI_PASSWORD: masterPassword,
      ENCRYPTION_KEY: legacyPassword,
    });

    assert.match(readFileSync(path.join(dataDir, "master.key"), "utf8"), /^v3:wrapped:/);

    const output = runModule(`
      import path from "node:path";
      import { initCrypto, readEncryptedJson } from "./src/store/crypto.js";
      initCrypto({ masterPassword: process.env.UI_PASSWORD, legacyPassword: "" });
      process.stdout.write(JSON.stringify(readEncryptedJson(path.join(process.env.NOEMA_DATA_DIR, "probe.json"), [])));
    `, {
      NOEMA_DATA_DIR: dataDir,
      UI_PASSWORD: masterPassword,
      ENCRYPTION_KEY: "",
    });

    assert.deepEqual(JSON.parse(output), [{ id: "probe", value: 42 }]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("legacy v3 key wrapped by ENCRYPTION_KEY is re-wrapped by UI_PASSWORD", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "noema-master-password-v3-"));
  const legacyPassword = "legacy-v3-wrapper-secret-for-test";
  const masterPassword = "new-ui-master-password-for-test";

  try {
    runModule(`
      import path from "node:path";
      import { initCrypto, writeEncryptedJson } from "./src/store/crypto.js";
      initCrypto({ masterPassword: process.env.ENCRYPTION_KEY, legacyPassword: "" });
      writeEncryptedJson(path.join(process.env.NOEMA_DATA_DIR, "probe.json"), [{ id: "legacy-v3", value: 84 }]);
    `, {
      NOEMA_DATA_DIR: dataDir,
      UI_PASSWORD: "",
      ENCRYPTION_KEY: legacyPassword,
    });

    const before = readFileSync(path.join(dataDir, "master.key"), "utf8");
    assert.match(before, /^v3:wrapped:/);

    runModule(`
      import path from "node:path";
      import { initCrypto, protectCryptoWithPassword, readEncryptedJson } from "./src/store/crypto.js";
      initCrypto({ masterPassword: process.env.UI_PASSWORD, legacyPassword: process.env.ENCRYPTION_KEY });
      const probe = readEncryptedJson(path.join(process.env.NOEMA_DATA_DIR, "probe.json"), []);
      if (probe[0]?.value !== 84) throw new Error("legacy encrypted data was not readable before re-wrap");
      protectCryptoWithPassword(process.env.UI_PASSWORD);
    `, {
      NOEMA_DATA_DIR: dataDir,
      UI_PASSWORD: masterPassword,
      ENCRYPTION_KEY: legacyPassword,
    });

    const after = readFileSync(path.join(dataDir, "master.key"), "utf8");
    assert.match(after, /^v3:wrapped:/);
    assert.notEqual(after, before);

    const output = runModule(`
      import path from "node:path";
      import { initCrypto, readEncryptedJson } from "./src/store/crypto.js";
      initCrypto({ masterPassword: process.env.UI_PASSWORD, legacyPassword: "" });
      process.stdout.write(JSON.stringify(readEncryptedJson(path.join(process.env.NOEMA_DATA_DIR, "probe.json"), [])));
    `, {
      NOEMA_DATA_DIR: dataDir,
      UI_PASSWORD: masterPassword,
      ENCRYPTION_KEY: "",
    });

    assert.deepEqual(JSON.parse(output), [{ id: "legacy-v3", value: 84 }]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
