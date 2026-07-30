/**
 * Utilities
 */

import { config } from "../config.js";

/**
 * Vraća datumsko vreme u YYYY-MM-DD formatu, u zadatoj (podrazumevano
 * konfigurisanoj, npr. Europe/Belgrade) vremenskoj zoni — NE u vremenskoj zoni
 * servera/kontejnera (koja je npr. u Dockeru podrazumevano UTC).
 * @param {Date|number} [d=Date.now()]
 * @param {string} [timeZone=config.NOEMA_TIMEZONE]
 */
export function todayISO(d, timeZone = config.NOEMA_TIMEZONE) {
  const date = d ? new Date(d) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Offset (u minutima, istočno od UTC pozitivan) date vremenske zone u datom trenutku.
 * Bez eksternih zavisnosti (npr. moment-timezone) — koristi Intl.DateTimeFormat.
 */
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

/**
 * UTC granice (00:00:00–23:59:59) datog kalendarskog dana U ZADATOJ vremenskoj zoni.
 * Bitno za Google Calendar celodnevne (all-day) događaje: Google ih smešta u
 * podrazumevanu vremensku zonu kalendara — ne u UTC niti u vremensku zonu servera —
 * pa granice moramo računati u istoj zoni, inače susedni dan "procuri" u upit
 * (npr. rođendan sutra se prikaže pod "danas").
 * @param {string} iso YYYY-MM-DD
 * @param {string} timeZone IANA zona (npr. "Europe/Belgrade")
 */
export function zonedDayBoundsUTC(iso, timeZone) {
  const [y, m, d] = iso.split("-").map(Number);
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12)); // referenca za offset, izbjegava DST ivice
  const offsetMin = tzOffsetMinutes(timeZone, noonUTC);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60_000);
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - offsetMin * 60_000);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/**
 * Prebacuje string "yesterday" | "today" | "tomorrow" u YYYY-MM-DD format
 * bazirano na navedenom baznom datumu (podrazumevano todayISO()).
 * @param {"yesterday"|"today"|"tomorrow"} dayStr
 * @param {string} [baseIso=todayISO()]
 */
export function resolveIsoDay(dayStr, baseIso) {
  const base = baseIso || todayISO();
  const d = new Date(base + "T00:00:00"); // Lokalna ponoć umesto Z
  if (dayStr === "yesterday") {
    d.setDate(d.getDate() - 1);
  } else if (dayStr === "tomorrow") {
    d.setDate(d.getDate() + 1);
  } else if (dayStr !== "today") {
    throw new Error(`Nevalidan parametar za dan: ${dayStr}`);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}


/** Return the weekday key (sun..sat) in the configured timezone. */
export function weekdayKey(d = Date.now(), timeZone = config.NOEMA_TIMEZONE) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(d)).toLowerCase();
  const keys = { sun: "sun", mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat" };
  if (!keys[label]) throw new Error("Unable to resolve weekday for timezone " + timeZone + ".");
  return keys[label];
}
