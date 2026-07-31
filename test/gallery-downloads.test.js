import test from "node:test";
import assert from "node:assert/strict";
import { matchAlbumDownloadPath, safeArchiveBaseName } from "../src/gallery-downloads.js";
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
