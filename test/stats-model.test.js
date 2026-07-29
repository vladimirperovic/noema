import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeline,
  weeklyFromTimeline,
  combineSeoSeries,
  dateRange,
  normalizeDays,
} from "../public/stats-model.js";

const projects = [
  {
    id: "alpha",
    name: "alpha.test",
    ok: true,
    series: [
      { date: "2026-07-22", clicks: 2, impressions: 20 },
      { date: "2026-07-23", clicks: 3, impressions: 30 },
      { date: "2026-07-24", clicks: 4, impressions: 40 },
      { date: "2026-07-25", clicks: 5, impressions: 50 },
    ],
  },
  {
    id: "beta",
    name: "beta.test",
    ok: true,
    series: [
      { date: "2026-07-22", clicks: 7, impressions: 70 },
      { date: "2026-07-24", clicks: 11, impressions: 110 },
      { date: "2026-07-25", clicks: 13, impressions: 130 },
    ],
  },
];

test("range is deterministic and uses UTC calendar dates", () => {
  assert.deepEqual(dateRange("2026-07-25", 7), [
    "2026-07-19", "2026-07-20", "2026-07-21", "2026-07-22",
    "2026-07-23", "2026-07-24", "2026-07-25",
  ]);
  assert.equal(normalizeDays("90"), 90);
  assert.equal(normalizeDays("14"), 30);
});

test("weekly table is an exact slice of the chart timeline", () => {
  const chart = buildTimeline(projects, 30, "clicks", "2026-07-25");
  const weekly = weeklyFromTimeline(chart);
  assert.deepEqual(weekly.dates, chart.dates.slice(-7));
  assert.deepEqual(weekly.totals, chart.totals.slice(-7));
  for (let index = 0; index < weekly.series.length; index++) {
    assert.deepEqual(weekly.series[index].values, chart.series[index].values.slice(-7));
  }
  assert.deepEqual(weekly.totals.slice(-4), [9, 3, 15, 18]);
});

test("combined SEO series sums projects by the same date", () => {
  assert.deepEqual(combineSeoSeries(projects).slice(-2), [
    { date: "2026-07-24", clicks: 15, impressions: 150 },
    { date: "2026-07-25", clicks: 18, impressions: 180 },
  ]);
});
