import test from "node:test";
import assert from "node:assert/strict";
import { clearLoginFailure, loginStatus, recordLoginFailure } from "../src/security/http.js";

test("login throttling locks one client without creating a global denial of service", () => {
  const attacker = "203.0.113.10";
  const otherClient = "203.0.113.11";
  clearLoginFailure(attacker);
  clearLoginFailure(otherClient);

  for (let attempt = 0; attempt < 5; attempt += 1) recordLoginFailure(attacker);
  assert.equal(loginStatus(attacker).locked, true);
  assert.equal(loginStatus(attacker).remaining, 0);

  // A distributed/global failure counter would let one source lock every user out.
  assert.equal(loginStatus(otherClient).locked, false);
  assert.equal(loginStatus(otherClient).remaining, 5);

  clearLoginFailure(attacker);
  assert.equal(loginStatus(attacker).locked, false);
});
