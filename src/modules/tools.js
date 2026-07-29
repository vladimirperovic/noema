import { resolveIsoDay } from "../core/utils.js";

import { registry } from "../core/registry.js";
import {
  addTask,
  updateTask,
  removeTask,
  listTasks,
  summary,
} from "../store/todos.js";
import { getCalendarEvents, isCalendarConfigured } from "../store/calendar.js";
import { createLinkWithMeta, listLinks } from "../store/links.js";

/**
 * Noema alati — port the reference implementation obrasca. Svaki alat se ovde definiše JEDNOM i
 * automatski se pojavljuje u OpenAPI šemi, MCP tool listi i kao REST ruta.
 *
 * `input` je JSON-Schema objekat (OpenAPI-compatible) umesto Zod-a, jer nemamo
 * dependency-je. Validaciju radi `core/validate.js`.
 */

const DAY_ENUM = ["yesterday", "today", "tomorrow"];
const PRIORITY_ENUM = ["low", "normal", "high", "medium"]; // "medium" = legacy alias za "normal"

const todoListTool = {
  name: "todo_list",
  title: "Lista taskova",
  description:
    "Vraća taskove razvrstane po danu (juče/danas/sjutra). Opciono filtrira po " +
    "danu i po statusu. Podrazumevano vraća sve neurađene taskove za tri dana.",
  module: "todos",
  input: {
    type: "object",
    properties: {
      days: {
        type: "array",
        items: { type: "string", enum: DAY_ENUM },
        description: "Koji dani (npr. [\"today\"]). Podrazumevano sva tri.",
      },
      include_done: {
        type: "boolean",
        default: false,
        description: "Da li uključiti i završene taskove.",
      },
    },
  },
  responseExample: {
    yesterday: [{ id: "a1", title: "Poslati izveštaj", priority: "medium", done: false }],
    today: [{ id: "b2", title: "Sastanak u 10h", priority: "high", done: false }],
    tomorrow: [],
  },
  handler: (input) => {
    const days = input.days && input.days.length ? input.days : DAY_ENUM;
    const tasks = listTasks(days, { includeDone: input.include_done ?? false });
    // Grupiši po danu radi čitljivosti za LLM.
    const grouped = { yesterday: [], today: [], tomorrow: [] };
    for (const t of tasks) {
      if (grouped[t.day]) grouped[t.day].push(stripTask(t));
    }
    return grouped;
  },
};

const todoAddTool = {
  name: "todo_add",
  title: "Dodaj task",
  description:
    "Dodaje novi task. `day` određuje u kojoj koloni se prikazuje " +
    "(yesterday/today/tomorrow). Vraća kreirani task sa id-jem.",
  module: "todos",
  input: {
    type: "object",
    required: ["title", "day"],
    properties: {
      title: {
        type: "string",
        minLength: 1,
        maxLength: 280,
        description: "Tekst taska (šta treba uraditi).",
      },
      day: {
        type: "string",
        enum: DAY_ENUM,
        description: "Dan: yesterday (juče), today (danas) ili tomorrow (sjutra).",
      },
      priority: {
        type: "string",
        enum: PRIORITY_ENUM,
        default: "normal",
        description: "Prioritet. Podrazumevano normal.",
      },
      time: {
        type: "string",
        description: "Vrijeme u formatu HH:MM (24h), npr. \"09:30\". Prazno = cijeli dan.",
      },
      repeat: {
        type: "string",
        enum: ["", "daily", "weekdays", "weekends", "mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        default: "",
        description: "Ponavljanje: daily, weekdays, weekends, ili dan u nedelji (mon..sun). Prazno = ne ponavlja se.",
      },
    },
  },
  responseExample: {
    id: "c3d4e5",
    title: "Završi izveštaj",
    day: "today",
    priority: "high",
    done: false,
  },
  handler: (input) => {
    const task = addTask(input.title, input.day, input.priority ?? "normal", false, input.time ?? null, input.repeat ?? "");
    return stripTask(task);
  },
};

const todoCompleteTool = {
  name: "todo_complete",
  title: "Označi task gotovim",
  description:
    "Označava task (po id-ju) kao gotov. Može i da poništi status ako je " +
    "`done: false`. Vraća ažurirani task ili grešku ako id ne postoji.",
  module: "todos",
  input: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "ID taska." },
      done: { type: "boolean", default: true, description: "True = gotov, false = ponovo otvoren." },
    },
  },
  responseExample: { id: "c3d4e5", title: "Završi izveštaj", day: "today", done: true },
  handler: (input) => {
    const updated = updateTask(input.id, { done: input.done ?? true });
    if (!updated) {
      throw new Error(`Task sa id "${input.id}" ne postoji.`);
    }
    return stripTask(updated);
  },
};

const todoDeleteTool = {
  name: "todo_delete",
  title: "Obriši task",
  description: "Briše task po id-ju. Vraća `{ ok, id }`.",
  module: "todos",
  input: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", description: "ID taska za brisanje." } },
  },
  responseExample: { ok: true, id: "c3d4e5" },
  handler: (input) => {
    const removed = removeTask(input.id);
    if (!removed) throw new Error(`Task sa id "${input.id}" ne postoji.`);
    return { ok: true, id: input.id };
  },
};

const todoSummaryTool = {
  name: "todo_summary",
  title: "Sažetak taskova",
  description:
    "Kratak sažetak za brzi pregled: broj otvorenih/završenih po danu i " +
    "naslovi neurađenih. Idealno za brz LLM odgovor tipa \"šta mi je danas ostalo\".",
  module: "todos",
  input: { type: "object", properties: {} },
  responseExample: {
    today: { total: 3, open: 2 },
    yesterday: { total: 2, open: 1 },
    tomorrow: { total: 2, open: 2 },
    openTitles: {
      yesterday: ["Poslati izveštaj klijentu"],
      today: ["Sastanak sa timom u 10h", "Završiti integraciju"],
      tomorrow: ["Pripremiti demo"],
    },
  },
  handler: () => summary(),
};

const calendarEventsTool = {
  name: "calendar_events",
  title: "Događaji iz kalendara",
  description:
    "Vraća Google Calendar događaje za zadati dan (podrazumevano danas). " +
    "Zahteva povezan kalendar (OAuth). Ako nije konfigurisan vraća " +
    "`notConfigured: true`, ako nije povezan `notConnected: true`.",
  module: "calendar",
  input: {
    type: "object",
    properties: {
      day: {
        type: "string",
        enum: DAY_ENUM,
        description: "Dan za koji se čitaju događaji. Podrazumevano today.",
      },
    },
  },
  responseExample: {
    events: [
      { id: "evt1", title: "Sastanak", start: "2026-06-23T10:00:00", end: "2026-06-23T11:00:00" },
    ],
  },
  handler: async (input) => {
    const isoDay = resolveIsoDay(input.day ?? "today");
    return getCalendarEvents(isoDay);
  },
};

const linkAddTool = {
  name: "link_add",
  title: "Sačuvaj link",
  description:
    "Čuva link (URL) u Noema linkdump. Ako naslov/slika/opis nisu poslati, " +
    "server sam pokušava da ih pročita sa stranice (Open Graph). Isti URL se " +
    "ne duplira — vraća postojeći zapis sa `existed: true`. Ovo koristi i " +
    "iOS Shortcut (share sheet) i bookmarklet.",
  module: "links",
  input: {
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string", minLength: 1, maxLength: 2048, description: "Adresa stranice (http/https)." },
      title: { type: "string", maxLength: 300, description: "Naslov stranice. Prazno = server čita og:title." },
      description: { type: "string", maxLength: 1000, description: "Kratak opis. Prazno = server čita og:description." },
      image: { type: "string", maxLength: 2048, description: "URL slike (og:image) za preview karticu." },
      label: { type: "string", maxLength: 40, description: "Labela/grupa za sortiranje (npr. \"instagram\", \"recepti\")." },
    },
  },
  responseExample: {
    link: { id: "d4e5f6", url: "https://example.com/clanak", title: "Naslov članka", label: "clanci" },
    existed: false,
  },
  handler: async (input) => createLinkWithMeta(input),
};

const linkListTool = {
  name: "link_list",
  title: "Lista linkova",
  description:
    "Vraća sačuvane linkove iz linkdump-a, najnoviji prvo. Opciona pretraga " +
    "po tekstu (`q` — naslov/opis/URL/labela) i filter po labeli.",
  module: "links",
  input: {
    type: "object",
    properties: {
      q: { type: "string", maxLength: 200, description: "Tekst pretrage." },
      label: { type: "string", maxLength: 40, description: "Filter: samo linkovi sa ovom labelom." },
      limit: { type: "number", description: "Maksimalan broj rezultata (default 50)." },
    },
  },
  responseExample: {
    links: [{ id: "d4e5f6", url: "https://example.com", title: "Primjer", label: "clanci", domain: "example.com" }],
  },
  handler: (input) => ({
    links: listLinks({ q: input.q, label: input.label, limit: input.limit ?? 50, collection: "" }),
  }),
};

/** Skini interno-only polja pre nego što vratimo task ka klijentu/LLM-u. */
function stripTask(t) {
  return {
    id: t.id,
    title: t.title,
    day: t.day,
    priority: t.priority,
    done: t.done,
    time: t.time ?? null,
    repeat: t.repeat ?? "",
  };
}

/** Registruje sve alate u deljeni registar. Poziva se jednom na startu. */
export function registerNoemaTools() {
  registry.register(todoListTool);
  registry.register(todoAddTool);
  registry.register(todoCompleteTool);
  registry.register(todoDeleteTool);
  registry.register(todoSummaryTool);
  registry.register(calendarEventsTool);
  registry.register(linkAddTool);
  registry.register(linkListTool);
}
