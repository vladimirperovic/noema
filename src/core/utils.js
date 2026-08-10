/**
 * Utilities
 */

import { config } from "../config.js";

/** Vraća datum u YYYY-MM-DD formatu u zadatoj IANA vremenskoj zoni. */
export function todayISO(d = Date.now(), timeZone = config.NOEMA_TIMEZONE) {
  const date = new Date(d);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Calendar-day arithmetic without relying on the host/container timezone. */
export function addIsoDays(iso, amount) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) || !Number.isInteger(amount)) {
    throw new Error("Invalid ISO date arithmetic input.");
  }
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

/** Offset in minutes, east of UTC positive, at a specific instant. */
function tzOffsetMinutes(timeZone, instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUTC - instant.getTime()) / 60_000);
}

function zonedWallTimeUTC(year, month, day, hour, minute, second, timeZone) {
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = wallUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = tzOffsetMinutes(timeZone, new Date(instant));
    const next = wallUtc - offset * 60_000;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant);
}

/**
 * UTC bounds for a calendar day in an IANA timezone. Start of the next local
 * day is resolved separately so DST transition days correctly span 23/25 h.
 */
export function zonedDayBoundsUTC(iso, timeZone = config.NOEMA_TIMEZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) throw new Error("Invalid ISO date.");
  const [year, month, day] = iso.split("-").map(Number);
  const nextIso = addIsoDays(iso, 1);
  const [nextYear, nextMonth, nextDay] = nextIso.split("-").map(Number);
  const start = zonedWallTimeUTC(year, month, day, 0, 0, 0, timeZone);
  const nextStart = zonedWallTimeUTC(nextYear, nextMonth, nextDay, 0, 0, 0, timeZone);
  return {
    timeMin: start.toISOString(),
    timeMax: new Date(nextStart.getTime() - 1).toISOString(),
  };
}

/** Convert yesterday/today/tomorrow to YYYY-MM-DD. */
export function resolveIsoDay(dayStr, baseIso) {
  const base = baseIso || todayISO();
  if (dayStr === "yesterday") return addIsoDays(base, -1);
  if (dayStr === "tomorrow") return addIsoDays(base, 1);
  if (dayStr === "today") return base;
  throw new Error(`Nevalidan parametar za dan: ${dayStr}`);
}

/** Return the weekday key (sun..sat) in the configured timezone. */
export function weekdayKey(d = Date.now(), timeZone = config.NOEMA_TIMEZONE) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(d)).toLowerCase();
  const keys = { sun: "sun", mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat" };
  if (!keys[label]) throw new Error("Unable to resolve weekday for timezone " + timeZone + ".");
  return keys[label];
}
