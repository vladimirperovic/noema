import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

test("gallery originals and thumbnails are encrypted before the API response completes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "noema-private-media-"));
  const dataDir = path.join(root, "data");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      ALLOW_INSECURE_NO_AUTH: "true",
      HOST: "127.0.0.1",
      PORT: String(port),
      PUBLIC_BASE_URL: baseUrl,
      NOEMA_CORS_ORIGIN: baseUrl,
      NOEMA_DATA_DIR: dataDir,
      UI_PASSWORD: "",
      ENCRYPTION_KEY: "integration-private-media-key",
      NOEMA_API_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}/healthz`);
        if (response.ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempt === 59) throw new Error(`Noema did not start:\n${output}`);
    }

    const original = Buffer.from("private-inspiration-original-bytes-that-must-not-remain-plaintext");
    const thumbnail = Buffer.from("private-inspiration-thumbnail-bytes");
    const create = await fetch(`${baseUrl}/api/inspirations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Encrypted gallery test",
        images: [{
          name: "private.png",
          type: "image/png",
          data: original.toString("base64"),
          thumbnailData: thumbnail.toString("base64"),
        }],
      }),
    });
    const payload = await create.json();
    assert.equal(create.status, 201, JSON.stringify(payload));
    assert.equal(payload.ok, true);
    const item = payload.inspiration;
    const image = item.images[0];

    const diskPath = (urlPath) => path.join(
      dataDir,
      urlPath.replace(/^\//, "").replace(/^inspiration-files\//, "inspirations/"),
    );
    const storedOriginal = await readFile(diskPath(image.original));
    const storedThumbnail = await readFile(diskPath(image.thumbnail));
    assert.equal(storedOriginal.subarray(0, 14).toString("ascii"), "NOEMA-ASSET-V1");
    assert.equal(storedThumbnail.subarray(0, 14).toString("ascii"), "NOEMA-ASSET-V1");
    assert.equal(storedOriginal.includes(original), false);
    assert.equal(storedThumbnail.includes(thumbnail), false);

    const served = await fetch(`${baseUrl}${image.original}`);
    assert.equal(served.status, 200);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), original);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(resolve, 2500);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    await rm(root, { recursive: true, force: true });
  }
});
