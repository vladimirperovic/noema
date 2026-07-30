import { todayISO, weekdayKey } from "../core/utils.js";

import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readEncryptedJson, writeEncryptedJson } from "./crypto.js";

/**
 * JSON-file backed storage za taskove.
 *
 * In-memory mapa + automatski persist u `data/todos.json`. Za MVP je ovo
 * sasvim dovoljno (jedan korisnik, nema konkurentnih servera). Lako se menja
 * u SQLite/Postgres kasnije bez diranja tool sloja.
 *
 * "Day" model: svaki task pamti APSOLUTNI datum `scheduledFor` (YYYY-MM-DD).
 * Kolona (yesterday/today/tomorrow) se RAČUNA u letu u odnosu na današnji
 * datum — tako "sjutra" automatski postane "danas" kad prođe ponoć, a stari
 * neurađeni taskovi ostaju u "juče" (preostalo). API napolju i dalje govori
 * jezikom {yesterday, today, tomorrow} pa se MCP/OpenAPI ugovor ne menja.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "todos.json");

/** @type {Map<string, object>} id -> raw task (scheduledFor, bez izvedenog day) */
const tasks = new Map();
let dirty = false;
let persistTimer = null;


/** Lokalni datum u YYYY-MM-DD (bez UTC offseta). */
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {string} iso @param {number} n → iso pomeren za n dana */
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toISODate(dt);
}

/**
 * Normalizuj vrijeme u "HH:MM" (24h) ili null ako nije validno.
 * Prihvata "9:5" → "09:05". Vrijeme je opciono — task bez njega je "celi dan".
 */
function normTime(t) {
  if (typeof t !== "string") return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Logički dan ("yesterday"|"today"|"tomorrow") → apsolutni datum. */
function dayToDate(day, today = todayISO()) {
  if (day === "yesterday") return addDays(today, -1);
  if (day === "tomorrow") return addDays(today, 1);
  return today;
}

/**
 * Apsolutni datum → kolona u odnosu na danas. ISO datumi se porede leksički.
 *   < danas  → yesterday (sve preostalo/zakasnelo)
 *   = danas  → today
 *   > danas  → tomorrow (sve buduće)
 */
function bucketFor(scheduledFor, today = todayISO()) {
  if (scheduledFor < today) return "yesterday";
  if (scheduledFor > today) return "tomorrow";
  return "today";
}

/** Vrati kopiju taska sa izvedenim `day` poljem (za UI/API). */
function withDay(t, today = todayISO()) {
  return { ...t, day: bucketFor(t.scheduledFor, today) };
}

/** Učitaj postojeće podatke sa diska u memoriju. Poziva se jednom na startu. */
export function loadStore() {
  mkdirSync(DATA_DIR, { recursive: true });
  tasks.clear();
  const today = todayISO();
  try {
    if (existsSync(DATA_FILE)) {
      const arr = readEncryptedJson(DATA_FILE, []);
      if (Array.isArray(arr)) {
        for (const t of arr) {
          if (!t || typeof t.id !== "string") continue;
          // Migracija sa starog formata: zamrznut `day` → apsolutni datum.
          if (!t.scheduledFor && typeof t.day === "string") {
            t.scheduledFor = dayToDate(t.day, today);
          }
          if (!t.scheduledFor) t.scheduledFor = today;
          delete t.day; // izvedeno polje se ne čuva
          tasks.set(t.id, t);
        }
      }
    }
  } catch (err) {
    console.error("[noema] Ne mogu da pročitam", DATA_FILE, "— krećem prazno:", err.message);
  }

  // Ako je prazno, seeduj nekoliko demonstrativnih taskova da UI nije pusto.
  if (tasks.size === 0) {
    seedDemo();
  }

  // Generiši ponavljajuće taskove za danas.
  generateRecurring();
  // Ponavljaj svakih sat vremena (da uhvati prelazak u novi dan).
  setInterval(() => generateRecurring(), 3600_000).unref?.();
}

function seedDemo() {
  const demo = [
    { title: "Review pull requests", day: "yesterday", priority: "high", done: true },
    { title: "Send the report to the client", day: "yesterday", priority: "normal", done: false },
    { title: "Team meeting at 10:00", day: "today", priority: "high", done: false },
    { title: "Read the MCP specification", day: "today", priority: "low", done: false },
    { title: "Prepare a demo for the client", day: "tomorrow", priority: "high", done: false },
  ];
  for (const d of demo) addTask(d.title, d.day, d.priority, d.done);
  flushNow();
}

/** Odmah zapiši na disk (sinhrono, jednostavno za MVP). */
function flushNow() {
  mkdirSync(DATA_DIR, { recursive: true });
  const arr = [...tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
  writeEncryptedJson(DATA_FILE, arr);
  dirty = false;
}

/** Debounced persist — skuplja brze uzastopne promene u jedan upis. */
function schedulePersist() {
  dirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (dirty) flushNow();
  }, 150);
  persistTimer.unref?.();
}

const REPEAT_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * @param {string} title
 * @param {"yesterday"|"today"|"tomorrow"} day
 * @param {"low"|"normal"|"high"} [priority="normal"] ("medium" je prihvaćen legacy alias)
 * @param {boolean} [done=false]
 * @param {string|null} [time=null] "HH:MM" ili null za "celi dan"
 * @param {string} [repeat=""] ""=none, "daily", "weekdays", "weekends", "mon".."sun"
 */
export function addTask(title, day, priority = "normal", done = false, time = null, repeat = "") {
  const validDay = ["yesterday", "today", "tomorrow"].includes(day) ? day : "today";
  const validPrio = ["low", "normal", "medium", "high"].includes(priority) ? priority : "normal";
  const task = {
    id: randomUUID(),
    title: title.trim(),
    scheduledFor: dayToDate(validDay),
    time: normTime(time),
    priority: validPrio,
    done: !!done,
    repeat: REPEAT_DAYS.includes(repeat) || repeat === "daily" || repeat === "weekdays" || repeat === "weekends" ? repeat : "",
    subtasks: [],
    order: Date.now(), // za custom drag & drop sortiranje
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.set(task.id, task);
  schedulePersist();
  return withDay(task);
}

/** @param {string} id */
export function getTask(id) {
  const t = tasks.get(id);
  return t ? withDay(t) : undefined;
}

/** @param {string} id @param {object} patch */
export function updateTask(id, patch) {
  const t = tasks.get(id);
  if (!t) return null;
  const next = { ...t };
  if (typeof patch.title === "string" && patch.title.trim()) {
    next.title = patch.title.trim();
  }
  if (["yesterday", "today", "tomorrow"].includes(patch.day)) {
    next.scheduledFor = dayToDate(patch.day);
  }
  if (["low", "normal", "medium", "high"].includes(patch.priority)) {
    next.priority = patch.priority;
  }
  if (typeof patch.done === "boolean") {
    next.done = patch.done;
    if (patch.done && Array.isArray(next.subtasks)) {
      next.subtasks = next.subtasks.map(st => ({ ...st, done: true }));
    }
  }
  if ("time" in patch) {
    next.time = patch.time === null || patch.time === "" ? null : normTime(patch.time);
  }
  if ("repeat" in patch) {
    const r = patch.repeat;
    next.repeat = r === null || r === "" ? "" : r;
  }
  if (typeof patch.order === "number") {
    next.order = patch.order;
  }
  if (Array.isArray(patch.subtasks)) {
    next.subtasks = patch.subtasks;
  }
  next.updatedAt = Date.now();
  tasks.set(id, next);
  schedulePersist();
  return withDay(next);
}

/** @param {string} id */
export function removeTask(id) {
  const existed = tasks.delete(id);
  if (existed) schedulePersist();
  return existed;
}

/**
 * Generiše ponavljajuće taskove za danas.
 * Prolazi kroz sve taskove sa postavljenim `repeat` i kreira instancu za danas
 * ako već ne postoji task sa istim naslovom za današnji datum.
 */
export function generateRecurring(now = Date.now()) {
  const today = todayISO(now);
  const dayName = weekdayKey(now);
  let created = 0;

  for (const t of [...tasks.values()]) {
    if (!t.repeat) continue;

    // Da li se ponavljanje poklapa sa danas?
    const match =
      t.repeat === "daily" ||
      (t.repeat === "weekdays" && dow >= 1 && dow <= 5) ||
      (t.repeat === "weekends" && (dow === 0 || dow === 6)) ||
      t.repeat === dayName;

    if (!match) continue;

    // Već postoji task sa istim naslovom za danas? (Uključuje i sam šablon —
    // ako je šablon kreiran za danas, on JE današnja instanca, ne dupliramo je.)
    const exists = [...tasks.values()].some(
      (x) => x.scheduledFor === today && x.title === t.title
    );
    if (exists) continue;

    // Kreiraj novu instancu
    const task = {
      id: randomUUID(),
      title: t.title,
      scheduledFor: today,
      time: t.time,
      priority: t.priority,
      done: false,
      repeat: t.repeat,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(st => ({ ...st, done: false })) : [],
      order: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tasks.set(task.id, task);
    created++;
  }

  if (created) schedulePersist();
  return created;
}

/**
 * Vraća taskove (sa izvedenim `day`), opciono filtrirane po danu.
 * @param {("yesterday"|"today"|"tomorrow")[]} [days]
 * @param {{ includeDone?: boolean }} [opts]
 */
export function listTasks(days, opts = {}) {
  const includeDone = opts.includeDone !== false;
  const today = todayISO();
  let arr = [...tasks.values()].map((t) => withDay(t, today));
  if (days && days.length) {
    const set = new Set(days);
    arr = arr.filter((t) => set.has(t.day));
  }
  if (!includeDone) arr = arr.filter((t) => !t.done);
  // Sort: po prioritetu (high>normal>low), neurađeni prvo, pa po createdAt.
  const prioRank = { high: 0, normal: 1, medium: 1, low: 2 };
  arr.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.priority !== b.priority) return prioRank[a.priority] - prioRank[b.priority];
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    // Ako imaju definisan order, koristi njega, u suprotnom createdAt
    const orderA = typeof a.order === "number" ? a.order : a.createdAt;
    const orderB = typeof b.order === "number" ? b.order : b.createdAt;
    return orderA - orderB;
  });
  return arr;
}

/** Kratak sažetak za LLM (brojevi po danu + neurađeni). */
export function summary() {
  const today = todayISO();
  const all = [...tasks.values()].map((t) => withDay(t, today));
  const count = (day) => all.filter((t) => t.day === day);
  const open = (day) => count(day).filter((t) => !t.done);
  return {
    today: { total: count("today").length, open: open("today").length },
    yesterday: { total: count("yesterday").length, open: open("yesterday").length },
    tomorrow: { total: count("tomorrow").length, open: open("tomorrow").length },
    openTitles: {
      yesterday: open("yesterday").map((t) => t.title),
      today: open("today").map((t) => t.title),
      tomorrow: open("tomorrow").map((t) => t.title),
    },
  };
}

/** Sinhroni flush na graceful shutdown. */
export function closeStore() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (dirty) flushNow();
}

/**
 * Zamijeni sve taskove (za backup restore).
 * @param {Array} newTasks
 */
export function replaceTasks(newTasks) {
  tasks.clear();
  if (!Array.isArray(newTasks)) return;
  for (const t of newTasks) {
    if (!t || typeof t.id !== "string") continue;
    if (!t.scheduledFor && typeof t.day === "string") {
      t.scheduledFor = dayToDate(t.day, todayISO());
    }
    if (!t.scheduledFor) t.scheduledFor = todayISO();
    delete t.day;
    tasks.set(t.id, t);
  }
  flushNow();
}
