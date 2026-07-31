import { createHash, randomUUID } from "node:crypto";
import { todayISO, weekdayKey } from "../core/utils.js";
import { createCollection } from "./collection.js";

const REPEAT_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAYS = new Set(["mon", "tue", "wed", "thu", "fri"]);
const SOURCE_TYPES = new Set(["document", "note", "link", "file", "inspiration", "building-site", "ai-project"]);
const SOURCE_MARKER = /\u2063NOEMA_SOURCE:([^\s]+)\s*$/;
let recurringTimer = null;

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(iso, amount) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

function normTime(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function dayToDate(day, today = todayISO()) {
  if (day === "yesterday") return addDays(today, -1);
  if (day === "tomorrow") return addDays(today, 1);
  return today;
}

function bucketFor(scheduledFor, today = todayISO()) {
  if (scheduledFor < today) return "yesterday";
  if (scheduledFor > today) return "tomorrow";
  return "today";
}

function withDay(task, today = todayISO()) {
  return { ...task, day: bucketFor(task.scheduledFor, today) };
}

function normalizeSource(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const type = String(raw.type || "").trim();
  const id = String(raw.id || "").trim();
  if (!SOURCE_TYPES.has(type) || !id || id.length > 240) return null;
  return { type, id };
}

function parseSourceTitle(value) {
  const text = String(value || "");
  const match = text.match(SOURCE_MARKER);
  if (!match) return { title: text.trim(), source: null };
  let source = null;
  try { source = normalizeSource(JSON.parse(decodeURIComponent(match[1]))); } catch {}
  return { title: text.slice(0, match.index).trim(), source };
}

function normalizeTask(raw) {
  const task = { ...raw };
  const now = Date.now();
  const parsedTitle = parseSourceTitle(task.title);
  if (!task.scheduledFor && typeof task.day === "string") task.scheduledFor = dayToDate(task.day);
  if (!task.scheduledFor) task.scheduledFor = todayISO();
  delete task.day;
  task.title = parsedTitle.title;
  task.source = normalizeSource(task.source) || parsedTitle.source;
  if (!task.source) delete task.source;
  task.time = task.time ? normTime(task.time) : null;
  task.priority = ["low", "normal", "medium", "high"].includes(task.priority) ? task.priority : "normal";
  task.done = Boolean(task.done);
  task.repeat = REPEAT_DAYS.includes(task.repeat) || ["daily", "weekdays", "weekends"].includes(task.repeat) ? task.repeat : "";
  const recurrenceTemplateId = String(task.recurrenceTemplateId || "").trim();
  const occurrenceDate = /^\d{4}-\d{2}-\d{2}$/.test(String(task.occurrenceDate || "")) ? String(task.occurrenceDate) : "";
  if (recurrenceTemplateId) task.recurrenceTemplateId = recurrenceTemplateId;
  else delete task.recurrenceTemplateId;
  if (occurrenceDate) task.occurrenceDate = occurrenceDate;
  else delete task.occurrenceDate;
  task.subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  task.order = Number.isFinite(task.order) ? task.order : (Number.isFinite(task.createdAt) ? task.createdAt : now);
  task.createdAt = Number.isFinite(task.createdAt) ? task.createdAt : now;
  task.updatedAt = Number.isFinite(task.updatedAt) ? task.updatedAt : task.createdAt;
  return task;
}

const tasks = createCollection({
  name: "todos",
  legacyFile: "todos.json",
  normalize: normalizeTask,
  validate: (task) => Boolean(task?.id && typeof task.title === "string"),
});

export function loadStore() {
  const loaded = tasks.load();
  if (loaded.length === 0) seedDemo();
  else migrateLegacyRecurringTasks(loaded);
  generateRecurring();
  if (!recurringTimer) {
    recurringTimer = setInterval(() => generateRecurring(), 3_600_000);
    recurringTimer.unref?.();
  }
}

function recurrenceSignature(task) {
  return JSON.stringify({
    title: task.title,
    repeat: task.repeat,
    time: task.time,
    priority: task.priority,
    subtasks: (task.subtasks || []).map((subtask) => String(subtask?.title || subtask?.text || "")),
  });
}

function migrateLegacyRecurringTasks(loaded) {
  const groups = new Map();
  for (const task of loaded) {
    if (!task.repeat || task.recurrenceTemplateId) continue;
    const signature = recurrenceSignature(task);
    const group = groups.get(signature) || [];
    group.push(task);
    groups.set(signature, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const distinctDates = new Set(group.map((task) => task.scheduledFor));
    if (group.length > 1 && distinctDates.size > 1) {
      const template = group[0];
      tasks.set(normalizeTask({ ...template, recurrenceTemplateId: template.id }));
      for (const occurrence of group.slice(1)) {
        tasks.set(normalizeTask({ ...occurrence, repeat: "", recurrenceTemplateId: template.id, occurrenceDate: occurrence.scheduledFor }));
      }
    } else {
      for (const template of group) tasks.set(normalizeTask({ ...template, recurrenceTemplateId: template.id }));
    }
  }
}

function recurrenceOccurrenceId(templateId, isoDay) {
  return `rec-${createHash("sha256").update(`${templateId}:${isoDay}`).digest("hex").slice(0, 32)}`;
}

function seedDemo() {
  const demo = [
    { title: "Review pull requests", day: "yesterday", priority: "high", done: true },
    { title: "Send the report to the client", day: "yesterday", priority: "normal", done: false },
    { title: "Team meeting at 10:00", day: "today", priority: "high", done: false },
    { title: "Read the MCP specification", day: "today", priority: "low", done: false },
    { title: "Prepare a demo for the client", day: "tomorrow", priority: "high", done: false },
  ];
  for (const item of demo) addTask(item.title, item.day, item.priority, item.done);
}

export function addTask(title, day, priority = "normal", done = false, time = null, repeat = "", explicitSource = null) {
  const now = Date.now();
  const parsedTitle = parseSourceTitle(title);
  const source = normalizeSource(explicitSource) || parsedTitle.source;
  if (source) {
    const existing = tasks.list().find((task) => task.source?.type === source.type && task.source?.id === source.id);
    if (existing) return withDay(existing);
  }
  const task = normalizeTask({
    id: randomUUID(),
    title: parsedTitle.title,
    source,
    scheduledFor: dayToDate(["yesterday", "today", "tomorrow"].includes(day) ? day : "today"),
    time,
    priority,
    done,
    repeat,
    subtasks: [],
    order: now,
    createdAt: now,
    updatedAt: now,
  });
  if (task.repeat) task.recurrenceTemplateId = task.id;
  return withDay(tasks.set(task));
}

export function getTask(id) {
  const task = tasks.get(id);
  return task ? withDay(task) : undefined;
}

export function updateTask(id, patch) {
  const current = tasks.get(id);
  if (!current) return null;
  const next = { ...current };
  if (!current.source && typeof patch.title === "string" && patch.title.trim()) next.title = patch.title.trim();
  if (!current.source && Object.hasOwn(patch, "source")) {
    const source = normalizeSource(patch.source);
    if (source) next.source = source;
  }
  if (["yesterday", "today", "tomorrow"].includes(patch.day)) next.scheduledFor = dayToDate(patch.day);
  if (["low", "normal", "medium", "high"].includes(patch.priority)) next.priority = patch.priority;
  if (typeof patch.done === "boolean") {
    next.done = patch.done;
    if (patch.done) next.subtasks = next.subtasks.map((subtask) => ({ ...subtask, done: true }));
  }
  if (Object.hasOwn(patch, "time")) next.time = patch.time === null || patch.time === "" ? null : normTime(patch.time);
  if (Object.hasOwn(patch, "repeat")) {
    next.repeat = patch.repeat === null ? "" : patch.repeat;
    const validRepeat = REPEAT_DAYS.includes(next.repeat) || ["daily", "weekdays", "weekends"].includes(next.repeat);
    if (validRepeat) {
      next.recurrenceTemplateId = next.id;
      delete next.occurrenceDate;
    } else if (!next.occurrenceDate) delete next.recurrenceTemplateId;
  }
  if (typeof patch.order === "number") next.order = patch.order;
  if (Array.isArray(patch.subtasks)) next.subtasks = patch.subtasks;
  next.updatedAt = Date.now();
  return withDay(tasks.set(normalizeTask(next)));
}

export function removeTask(id) { return tasks.remove(id); }

export function generateRecurring(now = Date.now()) {
  const today = todayISO(now);
  const dayName = weekdayKey(now);
  let created = 0;
  const all = tasks.list();
  const templates = all.filter((task) => task.repeat && (!task.recurrenceTemplateId || task.recurrenceTemplateId === task.id));
  for (const template of templates) {
    const matches = template.repeat === "daily"
      || (template.repeat === "weekdays" && WEEKDAYS.has(dayName))
      || (template.repeat === "weekends" && !WEEKDAYS.has(dayName))
      || template.repeat === dayName;
    if (!matches) continue;
    const occurrenceId = recurrenceOccurrenceId(template.id, today);
    if (all.some((item) => item.id === occurrenceId || (item.recurrenceTemplateId === template.id && item.occurrenceDate === today))) continue;
    const timestamp = Date.now();
    tasks.set(normalizeTask({
      id: occurrenceId,
      title: template.title,
      scheduledFor: today,
      time: template.time,
      priority: template.priority,
      done: false,
      repeat: "",
      recurrenceTemplateId: template.id,
      occurrenceDate: today,
      subtasks: template.subtasks.map((subtask) => ({ ...subtask, done: false })),
      order: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    created += 1;
  }
  return created;
}

export function listTasks(days, options = {}) {
  const includeDone = options.includeDone !== false;
  const today = todayISO();
  let result = tasks.list().map((task) => withDay(task, today));
  if (days?.length) {
    const allowed = new Set(days);
    result = result.filter((task) => allowed.has(task.day));
  }
  if (!includeDone) result = result.filter((task) => !task.done);
  const priority = { high: 0, normal: 1, medium: 1, low: 2 };
  return result.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.priority !== b.priority) return priority[a.priority] - priority[b.priority];
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
  });
}

export function summary() {
  const all = listTasks();
  const group = (day) => all.filter((task) => task.day === day);
  const open = (day) => group(day).filter((task) => !task.done);
  return {
    today: { total: group("today").length, open: open("today").length },
    yesterday: { total: group("yesterday").length, open: open("yesterday").length },
    tomorrow: { total: group("tomorrow").length, open: open("tomorrow").length },
    openTitles: {
      yesterday: open("yesterday").map((task) => task.title),
      today: open("today").map((task) => task.title),
      tomorrow: open("tomorrow").map((task) => task.title),
    },
  };
}

export function replaceTasks(values) { tasks.replace(values); }

export function closeStore() {
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
  }
  tasks.close();
}
