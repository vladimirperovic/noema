import test from "node:test";
import assert from "node:assert/strict";
import { todayISO, weekdayKey } from "../src/core/utils.js";

test("weekdayKey follows the configured timezone at UTC date boundaries", () => {
  const instant = Date.parse("2026-01-01T00:30:00Z");
  assert.equal(todayISO(instant, "UTC"), "2026-01-01");
  assert.equal(weekdayKey(instant, "UTC"), "thu");
  assert.equal(todayISO(instant, "America/Los_Angeles"), "2025-12-31");
  assert.equal(weekdayKey(instant, "America/Los_Angeles"), "wed");
});
