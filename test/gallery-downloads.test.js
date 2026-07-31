import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAlbumArchive, matchAlbumDownloadPath, safeArchiveBaseName } from "../src/gallery-downloads.js";
import { shareAllows } from "../src/security/share-routes.js";

test("album download paths are decoded and scoped", () => {
  assert.deepEqual(matchAlbumDownloadPath("/api/inspirations/album%201/download"), {
    scope: "inspiration",
    id: "album 1",
  });
  assert.deepEqual(matchAlbumDownloadPath("/api/buildingsites/site-2/download"), {
    scope: "buildingsite",
    id: "site-2",
  });
  assert.equal(matchAlbumDownloadPath("/api/inspirations/album-1"), null);
});

test("archive names remove header and filesystem control characters", () => {
  assert.equal(safeArchiveBaseName("  Villa / phase: 1\r\n  "), "Villa phase 1");
  assert.equal(safeArchiveBaseName(""), "album");
});

test("album shares can download only their own gallery scope and album", () => {
  const inspirationShare = { scope: "inspiration", albumId: "inspiration-1" };
  assert.equal(shareAllows(inspirationShare, "/api/inspirations/inspiration-1/download"), true);
  assert.equal(shareAllows(inspirationShare, "/api/inspirations/inspiration-2/download"), false);
  assert.equal(shareAllows(inspirationShare, "/api/buildingsites/inspiration-1/download"), false);

  const allGalleriesShare = { scope: "galleries", albumId: "" };
  assert.equal(shareAllows(allGalleriesShare, "/api/inspirations/any/download"), true);
  assert.equal(shareAllows(allGalleriesShare, "/api/buildingsites/any/download"), true);
});

test("album archive contains numbered original files", async (t) => {
  if (spawnSync("zip", ["-v"], { stdio: "ignore" }).status !== 0 || spawnSync("unzip", ["-v"], { stdio: "ignore" }).status !== 0) {
    t.skip("zip and unzip are not installed on this host");
    return;
  }

  const dataDir = await mkdtemp(path.join(os.tmpdir(), "noema-gallery-download-test-"));
  const originals = path.join(dataDir, "inspirations", "album-1", "originals");
  await mkdir(originals, { recursive: true });
  await writeFile(path.join(originals, "first.jpg"), Buffer.from("first-original"));
  await writeFile(path.join(originals, "second.png"), Buffer.from("second-original"));

  let archive;
  try {
    archive = await createAlbumArchive("inspiration", {
      id: "album-1",
      title: "Test album",
      images: [
        { original: "/inspiration-files/album-1/originals/first.jpg" },
        { original: "/inspiration-files/album-1/originals/second.png" },
      ],
    }, dataDir);
    assert.equal(archive.copied, 2);
    const entries = execFileSync("unzip", ["-Z1", archive.archivePath], { encoding: "utf8" }).trim().split(/\r?\n/).sort();
    assert.deepEqual(entries, ["001.jpg", "002.png"]);
  } finally {
    if (archive?.tempRoot) await rm(archive.tempRoot, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});
