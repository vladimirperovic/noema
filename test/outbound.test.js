import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIp, safeFetchText, validatePublicHttpUrl } from "../src/core/outbound.js";

test("outbound URL validation rejects local and private targets", async () => {
  for (const value of [
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://" + ["10", "0", "0", "1"].join(".") + "/",
    "http://" + ["192", "168", "1", "1"].join(".") + "/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "ftp://example.com/file",
    "https://user:pass@example.com/",
  ]) {
    assert.throws(() => validatePublicHttpUrl(value));
  }
  await assert.rejects(() => safeFetchText("http://127.0.0.1/"), /private network/i);
});

test("public address classification and URL normalization", () => {
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp(["10", "0", "0", "1"].join(".")), false);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(validatePublicHttpUrl("https://example.com/a").href, "https://example.com/a");
});
