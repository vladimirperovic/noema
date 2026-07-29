export const ALLOWED_STATS_DAYS = Object.freeze([7, 30, 90, 180]);

export function normalizeDays(value) {
  const days = Number(value);
  return ALLOWED_STATS_DAYS.includes(days) ? days : 30;
}

function validIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addUtcDays(isoDate, amount) {
  if (!validIsoDate(isoDate)) return "";
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function dateRange(endDate, count) {
  if (!validIsoDate(endDate) || !Number.isInteger(count) || count < 1) return [];
  return Array.from({ length: count }, (_, index) => addUtcDays(endDate, index - count + 1));
}

function metricValue(row, metric) {
  const value = Number(row?.[metric]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function buildTimeline(projects, requestedDays, metric = "clicks", explicitEndDate = "") {
  const days = normalizeDays(requestedDays);
  const liveProjects = Array.isArray(projects) ? projects.filter((project) => project?.ok) : [];
  const latestSeriesDate = liveProjects
    .flatMap((project) => Array.isArray(project.series) ? project.series.map((row) => row.date) : [])
    .filter(validIsoDate)
    .sort()
    .at(-1) || "";
  const latestProjectDate = liveProjects.map((project) => project.dataThrough).filter(validIsoDate).sort().at(-1) || "";
  const endDate = validIsoDate(explicitEndDate) ? explicitEndDate : latestProjectDate || latestSeriesDate;
  const dates = dateRange(endDate, days);

  const series = liveProjects.map((project) => {
    const byDate = new Map((project.series || []).map((row) => [row.date, metricValue(row, metric)]));
    return {
      id: project.id,
      name: project.name,
      color: project.color,
      badge: project.badge,
      values: dates.map((date) => byDate.get(date) || 0),
    };
  });

  const totals = dates.map((_, index) => series.reduce((total, project) => total + project.values[index], 0));
  return { days, endDate, dates, series, totals, metric };
}

export function weeklyFromTimeline(timeline) {
  const start = Math.max(0, timeline.dates.length - 7);
  return {
    ...timeline,
    days: Math.min(7, timeline.dates.length),
    dates: timeline.dates.slice(start),
    series: timeline.series.map((project) => ({ ...project, values: project.values.slice(start) })),
    totals: timeline.totals.slice(start),
  };
}

export function combineSeoSeries(projects) {
  const byDate = new Map();
  for (const project of Array.isArray(projects) ? projects : []) {
    if (!project?.ok) continue;
    for (const row of project.series || []) {
      if (!validIsoDate(row.date)) continue;
      const current = byDate.get(row.date) || { date: row.date, clicks: 0, impressions: 0 };
      current.clicks += metricValue(row, "clicks");
      current.impressions += metricValue(row, "impressions");
      byDate.set(row.date, current);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function selectedSeoSeries(projects, projectId) {
  if (projectId === "all") return combineSeoSeries(projects);
  const project = (projects || []).find((item) => item.id === projectId && item.ok);
  return Array.isArray(project?.series) ? project.series : [];
}
