(() => {
  "use strict";

  const pathname = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";

  if (pathname === "/links" && !document.querySelector('script[src="/links-enhancements.js"]')) {
    const script = document.createElement("script");
    script.src = "/links-enhancements.js";
    script.defer = true;
    document.head.appendChild(script);
  }

  // Shared menu/theme controls are created inside #shell for the 3D push-menu
  // animation. Move them to document.body after setup so position:fixed is tied
  // to the viewport instead of to a transformed/scrolling ancestor.
  function pinSharedControls() {
    const burger = document.getElementById("mobileBurger");
    const theme = document.getElementById("topTheme");
    if (!burger || !theme) return false;
    if (burger.parentElement !== document.body) document.body.appendChild(burger);
    if (theme.parentElement !== document.body) document.body.appendChild(theme);
    burger.style.position = "fixed";
    theme.style.position = "fixed";
    burger.style.zIndex = "10001";
    theme.style.zIndex = "10001";
    return true;
  }
  let controlAttempts = 0;
  function ensureSharedControls() {
    controlAttempts += 1;
    if (!pinSharedControls() && controlAttempts < 40) setTimeout(ensureSharedControls, 50);
  }
  ensureSharedControls();

  const controlObserver = new MutationObserver(() => {
    if (document.getElementById("mobileBurger")?.parentElement !== document.body || document.getElementById("topTheme")?.parentElement !== document.body) pinSharedControls();
  });
  controlObserver.observe(document.documentElement, { childList: true, subtree: true });

  // The menu itself has a close button, so keep the floating controls out of the
  // way while the full-screen menu is open.
  const menuObserver = new MutationObserver(() => {
    const open = document.body.classList.contains("menu-pushed");
    const burger = document.getElementById("mobileBurger");
    const theme = document.getElementById("topTheme");
    if (burger) burger.style.visibility = open ? "hidden" : "visible";
    if (theme) theme.style.visibility = open ? "hidden" : "visible";
  });
  menuObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

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
