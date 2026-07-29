import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchQueries, normalizeSeoPayload, normalizeStatsDays, normalizeTrafficPayload } from "../src/services/analytics.js";

const project = {
  id: "alpha",
  name: "alpha.test",
  url: "https://alpha.test",
  color: "#fff",
  badge: "A",
};

test("normalizes Search Console rows and summary without changing dates", () => {
  const normalized = normalizeSeoPayload({
    totalClicks: 9,
    totalImpressions: 90,
    avgCtr: 0.1,
    avgPosition: 4.25,
    dataThrough: "2026-07-23",
    rows: [
      { keys: ["2026-07-22"], clicks: 4, impressions: 40, position: 4 },
      { keys: ["2026-07-23"], clicks: 5, impressions: 50, position: 4.5 },
    ],
  }, project, 30, new Date("2026-07-25T12:00:00Z"));

  assert.deepEqual(normalized.summary, {
    clicks: 9,
    impressions: 90,
    ctr: 10,
    avgPosition: 4.25,
  });
  assert.deepEqual(normalized.series.map((row) => row.date), ["2026-07-22", "2026-07-23"]);
  assert.equal(normalized.dataThrough, "2026-07-23");
  assert.equal(normalized.ageDays, 2);
  assert.equal(normalized.freshness, "fresh");
});

test("marks data older than three days as stale", () => {
  const normalized = normalizeSeoPayload({
    totalClicks: 1,
    totalImpressions: 10,
    rows: [{ date: "2026-07-20", clicks: 1, impressions: 10 }],
  }, project, 30, new Date("2026-07-25T12:00:00Z"));
  assert.equal(normalized.ageDays, 5);
  assert.equal(normalized.freshness, "stale");
});

test("normalizes live GA4 trend labels and traffic cards", () => {
  const normalized = normalizeTrafficPayload({
    dailyVisits: 3,
    weeklyVisits: 29,
    monthlyVisits: 55,
    bounceRate: 41.8,
    avgSessionDuration: "4m 42s",
    trend: [
      { date: "Jul 24", visits: 5, pageviews: 8 },
      { date: "Jul 25", visits: 3, pageviews: 6 },
    ],
  }, project, 30, new Date("2026-07-26T12:00:00Z"));

  assert.deepEqual(normalized.summary, {
    dailyVisits: 3,
    weeklyVisits: 29,
    monthlyVisits: 55,
    bounceRate: 41.8,
    avgSessionDuration: "4m 42s",
  });
  assert.deepEqual(normalized.series, [
    { date: "2026-07-24", visits: 5, pageviews: 8 },
    { date: "2026-07-25", visits: 3, pageviews: 6 },
  ]);
  assert.equal(normalized.dataThrough, "2026-07-25");
});

test("rejects an empty JSON payload instead of presenting fake zeroes", () => {
  assert.throws(
    () => normalizeSeoPayload({}, project, 30),
    /nije vratio metrike ni dnevnu seriju/,
  );
});

test("only supported periods reach the upstream API", () => {
  assert.equal(normalizeStatsDays(7), 7);
  assert.equal(normalizeStatsDays("180"), 180);
  assert.equal(normalizeStatsDays(365), 30);
});

test("search queries include CTR and ranking movement against the previous period", () => {
  const queries = normalizeSearchQueries([
    { keys: ["example studio"], clicks: 1, impressions: 13, position: 17 },
    { keys: ["automatizacija doma"], clicks: 0, impressions: 2, position: 87 },
  ], [
    { keys: ["example studio"], position: 21 },
  ]);

  assert.deepEqual(queries, [
    { keyword: "example studio", clicks: 1, impressions: 13, ctr: 7.69, position: 17, positionChange: 4 },
    { keyword: "automatizacija doma", clicks: 0, impressions: 2, ctr: 0, position: 87, positionChange: null },
  ]);
});

test("normalizes traffic payload with custom channels including chatgpt", () => {
  const normalized = normalizeTrafficPayload({
    dailyVisits: 3,
    weeklyVisits: 29,
    monthlyVisits: 55,
    bounceRate: 41.8,
    avgSessionDuration: "4m 42s",
    trend: [
      { date: "Jul 24", visits: 5, pageviews: 8 },
    ],
    channels: [
      { channel: "(direct) / (none)", visits: 19 },
      { channel: "chatgpt.com / ai-assistant", visits: 4 },
      { channel: "google / organic", visits: 4 },
    ],
  }, project, 30, new Date("2026-07-26T12:00:00Z"));

  assert.deepEqual(normalized.channels, [
    { channel: "(direct) / (none)", visits: 19, percent: 70.4 },
    { channel: "chatgpt.com / ai-assistant", visits: 4, percent: 14.8 },
    { channel: "google / organic", visits: 4, percent: 14.8 },
  ]);
});
