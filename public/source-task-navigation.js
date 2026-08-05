(() => {
  "use strict";

  const pathname = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";

  function pinFloatingControls() {
    const burger = document.getElementById("mobileBurger");
    const theme = document.getElementById("topTheme");
    if (!burger && !theme) return;

    let style = document.getElementById("noema-fixed-controls-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "noema-fixed-controls-style";
      style.textContent = `
        body > #mobileBurger,
        body > #topTheme {
          position: fixed !important;
          right: 1rem !important;
          margin: 0 !important;
          transform: none !important;
          z-index: 10001 !important;
        }
        body > #mobileBurger { top: calc(1rem + env(safe-area-inset-top, 0px)) !important; }
        body > #topTheme { top: calc(1rem + env(safe-area-inset-top, 0px) + 56px) !important; }
        body.menu-pushed > #mobileBurger,
        body.menu-pushed > #topTheme {
          opacity: 0;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }

    if (burger && burger.parentElement !== document.body) document.body.appendChild(burger);
    if (theme && theme.parentElement !== document.body) document.body.appendChild(theme);
  }

  pinFloatingControls();
  addEventListener("pageshow", pinFloatingControls);

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
