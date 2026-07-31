import { listTasks, replaceTasks } from "../store/todos.js";
import { listNotes, replaceNotes } from "../store/notes.js";
import { listDocuments, replaceDocuments } from "../store/documents.js";
import { listLinks, replaceLinks } from "../store/links.js";
import { listFiles, replaceFiles } from "../store/files.js";
import { listBuildingSites, replaceBuildingSites } from "../store/buildingsites.js";
import { listInspirations, replaceInspirations } from "../store/inspirations.js";

export function exportPortableState() {
  return {
    version: 3,
    scope: "metadata",
    includesMedia: false,
    exportedAt: new Date().toISOString(),
    data: {
      todos: listTasks(undefined, { includeDone: true }),
      notes: listNotes(),
      documents: listDocuments(),
      links: listLinks(),
      files: listFiles(),
      buildingSites: listBuildingSites(),
      inspirations: listInspirations(),
    },
  };
}

export function restorePortableState(backup) {
  if (!backup || typeof backup !== "object" || !backup.data || typeof backup.data !== "object") {
    throw Object.assign(new Error("The backup payload is invalid."), { status: 400 });
  }
  const restored = { todos: 0, notes: 0, documents: 0, links: 0, files: 0, buildingSites: 0, inspirations: 0 };
  const operations = [
    ["todos", replaceTasks], ["notes", replaceNotes], ["documents", replaceDocuments],
    ["links", replaceLinks], ["files", replaceFiles], ["buildingSites", replaceBuildingSites], ["inspirations", replaceInspirations],
  ];
  for (const [key, replace] of operations) {
    if (!Array.isArray(backup.data[key])) continue;
    replace(backup.data[key]);
    restored[key] = backup.data[key].length;
  }
  return restored;
}
