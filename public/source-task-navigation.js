(() => {
  "use strict";

  const pathname = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";

  function navigate(event) {
    const title = event.target.closest?.(".task.noema-source-linked .task-title");
    const href = title?.closest(".task.noema-source-linked")?.dataset.noemaSourceHref;
    if (!href) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(href);
  }

  document.addEventListener("click", navigate, true);
  document.addEventListener("dblclick", navigate, true);

  if (pathname !== "/notes") return;
  const requestedId = new URLSearchParams(location.search).get("open");
  if (!requestedId) return;
  let attempts = 0;
  let notes = null;

  async function openNote() {
    attempts += 1;
    try {
      if (!notes) {
        const response = await fetch("/api/notes", { headers: { Accept: "application/json" } });
        const data = await response.json();
        notes = response.ok && Array.isArray(data.notes) ? data.notes : [];
      }
      const items = [...document.querySelectorAll("#sidebarList .sidebar-item")];
      items.forEach((item, index) => { if (notes[index]?.id) item.dataset.noemaNoteId = notes[index].id; });
      const requested = items.find((item) => item.dataset.noemaNoteId === requestedId);
      if (requested) {
        requested.click();
        requested.scrollIntoView({ behavior: "smooth", block: "center" });
        requested.classList.add("noema-source-focus");
        setTimeout(() => requested.classList.remove("noema-source-focus"), 2600);
        return;
      }
    } catch {}
    if (attempts < 40) setTimeout(openNote, 125);
  }

  openNote();
})();
