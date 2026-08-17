/* Noema Inspiration — generic global fullscreen/grid modes. */
(() => {
  "use strict";
  if (document.documentElement.classList.contains("public-gallery")) return;
  const addButton = document.getElementById("openAdd");
  if (!addButton || document.getElementById("inspirationGlobalModes")) return;

  let albums = [];
  let covers = [];
  let allImages = [];
  let active = [];
  let activeIndex = 0;

  const esc = (value) => String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const imageEntry = (image, album, imageIndex) => {
    if (!image) return null;
    const original = image.original || image.preview || image.thumbnail;
    const thumbnail = image.thumbnail || image.preview || image.original;
    if (!original || !thumbnail) return null;
    return { ...image, original, thumbnail, albumId: album.id, albumTitle: album.title || "Inspiration", imageIndex };
  };
  const rebuild = () => {
    covers = albums.map((album) => imageEntry(album.images?.[0], album, 0)).filter(Boolean);
    allImages = albums.flatMap((album) => (album.images || []).map((image, index) => imageEntry(image, album, index)).filter(Boolean));
  };

  const style = document.createElement("style");
  style.textContent = `
    #inspirationGlobalModes{display:flex;align-items:center;justify-content:flex-end;gap:.55rem;flex-wrap:wrap}
    .inspiration-mode-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:.7rem .9rem;border:1px solid var(--line-2);border-radius:10px;color:var(--ink-2);background:var(--card);font-weight:600;white-space:nowrap}
    .inspiration-mode-button:hover{color:var(--accent);border-color:var(--accent)}.inspiration-mode-button:disabled{opacity:.42;cursor:wait}
    .noema-inspiration-global{position:fixed;inset:0;z-index:350000;background:#070709;color:#f4efe6}.noema-inspiration-global[hidden]{display:none!important}
    .noema-inspiration-viewer{display:grid;place-items:center;overflow:hidden}.noema-inspiration-stage{position:absolute;inset:0;display:grid;place-items:center}.noema-inspiration-stage img{width:100%;height:100%;object-fit:contain;display:block;background:#08080a}
    .noema-inspiration-hud{position:absolute;z-index:5;left:50%;top:1rem;transform:translateX(-50%);display:flex;align-items:center;gap:.55rem;padding:.45rem .55rem;border:1px solid rgba(255,255,255,.18);border-radius:11px;background:rgba(10,10,12,.86);backdrop-filter:blur(10px)}
    .noema-inspiration-hud button{min-height:34px;padding:.35rem .6rem;border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#f4efe6;background:transparent}.noema-inspiration-hud button:hover{border-color:var(--accent);color:var(--accent)}
    .noema-inspiration-title{max-width:42vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 .68rem var(--mono)}
    .noema-inspiration-grid-scroll{position:absolute;inset:0;overflow:auto;scrollbar-width:none}.noema-inspiration-grid-scroll::-webkit-scrollbar{display:none}.noema-inspiration-grid-track{--rows:2;min-height:100%;display:grid;grid-template-rows:repeat(var(--rows),minmax(160px,1fr));grid-auto-flow:column;grid-auto-columns:minmax(190px,26vw);gap:8px;padding:8px}.noema-inspiration-grid-cell{position:relative;padding:0;border:0;border-radius:3px;overflow:hidden;background:#111}.noema-inspiration-grid-cell img{width:100%;height:100%;display:block;object-fit:cover}.noema-inspiration-grid-cell:hover img{transform:scale(1.018)}
    body.noema-inspiration-global-open{overflow:hidden!important}body.noema-inspiration-global-open .burger,body.noema-inspiration-global-open .theme-fab{display:none!important}
    @media(max-width:760px){#inspirationGlobalModes{width:100%;display:grid;grid-template-columns:1fr 1fr;margin-top:1.5rem}#inspirationGlobalModes #openAdd{grid-column:1/-1}.inspiration-mode-button{width:100%}.noema-inspiration-title{max-width:55vw}.noema-inspiration-grid-track{grid-auto-columns:minmax(170px,70vw)}}
  `;
  document.head.appendChild(style);

  const modes = document.createElement("div");
  modes.id = "inspirationGlobalModes";
  addButton.parentNode.insertBefore(modes, addButton);
  const makeButton = (text) => { const button = document.createElement("button"); button.type = "button"; button.className = "inspiration-mode-button"; button.textContent = text; button.disabled = true; modes.appendChild(button); return button; };
  const fullscreen = makeButton("Fullscreen");
  const fullscreenAll = makeButton("Fullscreen All");
  const grid = makeButton("Grid");
  const gridAll = makeButton("Grid All");
  modes.appendChild(addButton);

  const viewer = document.createElement("div");
  viewer.className = "noema-inspiration-global noema-inspiration-viewer";
  viewer.hidden = true;
  viewer.innerHTML = `<div class="noema-inspiration-stage"><img alt=""></div><div class="noema-inspiration-hud"><button type="button" data-prev aria-label="Prethodna">←</button><span class="noema-inspiration-title"></span><button type="button" data-next aria-label="Sljedeća">→</button><button type="button" data-album aria-label="Otvori album">Album</button><button type="button" data-close aria-label="Zatvori">×</button></div>`;
  document.body.appendChild(viewer);
  const viewerImage = viewer.querySelector("img");
  const viewerTitle = viewer.querySelector(".noema-inspiration-title");

  const gridOverlay = document.createElement("div");
  gridOverlay.className = "noema-inspiration-global";
  gridOverlay.hidden = true;
  gridOverlay.innerHTML = `<div class="noema-inspiration-grid-scroll"><div class="noema-inspiration-grid-track"></div></div><div class="noema-inspiration-hud"><span class="noema-inspiration-title"></span><label style="font:500 .62rem var(--mono)">Rows <input data-rows type="range" min="2" max="4" step="1" value="2"></label><button type="button" data-close aria-label="Zatvori">×</button></div>`;
  document.body.appendChild(gridOverlay);
  const gridTrack = gridOverlay.querySelector(".noema-inspiration-grid-track");
  const gridTitle = gridOverlay.querySelector(".noema-inspiration-title");
  const rows = gridOverlay.querySelector("[data-rows]");

  const setButtons = () => { fullscreen.disabled = grid.disabled = !covers.length; fullscreenAll.disabled = gridAll.disabled = !allImages.length; };
  async function load(force = false) {
    if (!force && albums.length) return albums;
    const response = await fetch("/api/inspirations", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    albums = Array.isArray(data.inspirations) ? data.inspirations : [];
    rebuild(); setButtons(); return albums;
  }
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const requestFullscreen = (element) => { const fn = element?.requestFullscreen || element?.webkitRequestFullscreen; if (!fn) return; try { const value = fn.call(element); value?.catch?.(() => {}); } catch {} };
  const exitFullscreen = () => { if (!fullscreenElement()) return; const fn = document.exitFullscreen || document.webkitExitFullscreen; try { const value = fn?.call(document); value?.catch?.(() => {}); } catch {} };
  function closeOverlay(element) { if (fullscreenElement() === element) exitFullscreen(); element.hidden = true; if (viewer.hidden && gridOverlay.hidden) document.body.classList.remove("noema-inspiration-global-open"); }
  function showViewer() {
    const entry = active[activeIndex]; if (!entry) return;
    viewerImage.src = entry.original; viewerImage.alt = `${entry.albumTitle}, slika ${entry.imageIndex + 1}`;
    viewerTitle.textContent = `${entry.albumTitle} · ${activeIndex + 1}/${active.length}`;
  }
  async function openViewer(entries, index = 0) {
    if (!entries.length) return; active = entries; activeIndex = Math.max(0, Math.min(index, entries.length - 1)); showViewer(); viewer.hidden = false; document.body.classList.add("noema-inspiration-global-open"); requestFullscreen(viewer);
  }
  async function openSequence(useAll) { if (!(useAll ? allImages : covers).length) await load(true); return openViewer(useAll ? allImages : covers); }
  async function openGrid(useAll) {
    if (!(useAll ? allImages : covers).length) await load(true);
    const entries = useAll ? allImages : covers; if (!entries.length) return;
    gridTitle.textContent = `${useAll ? "Grid All" : "Grid"} · ${entries.length} slika`;
    gridTrack.innerHTML = entries.map((entry, index) => `<button class="noema-inspiration-grid-cell" type="button" data-index="${index}" aria-label="${esc(entry.albumTitle)}"><img src="${esc(entry.thumbnail)}" alt="" loading="${index < 8 ? "eager" : "lazy"}" decoding="async"></button>`).join("");
    gridOverlay._entries = entries; gridOverlay.hidden = false; document.body.classList.add("noema-inspiration-global-open"); requestFullscreen(gridOverlay);
  }

  viewer.querySelector("[data-prev]").addEventListener("click", () => { activeIndex = (activeIndex - 1 + active.length) % active.length; showViewer(); });
  viewer.querySelector("[data-next]").addEventListener("click", () => { activeIndex = (activeIndex + 1) % active.length; showViewer(); });
  viewer.querySelector("[data-album]").addEventListener("click", () => { const entry = active[activeIndex]; if (!entry) return; closeOverlay(viewer); location.hash = `album=${encodeURIComponent(entry.albumId)}`; });
  viewer.querySelector("[data-close]").addEventListener("click", () => closeOverlay(viewer));
  gridOverlay.querySelector("[data-close]").addEventListener("click", () => closeOverlay(gridOverlay));
  rows.addEventListener("input", () => { const value = Math.max(2, Math.min(4, Number(rows.value) || 2)); gridTrack.style.setProperty("--rows", String(value)); try { localStorage.setItem("noema-inspiration-global-rows", String(value)); } catch {} });
  gridTrack.addEventListener("click", (event) => { const cell = event.target.closest("[data-index]"); if (!cell) return; const entries = gridOverlay._entries || []; const entry = entries[Number(cell.dataset.index)]; if (!entry) return; closeOverlay(gridOverlay); openViewer(entries, Number(cell.dataset.index)); });
  document.addEventListener("keydown", (event) => { if (!viewer.hidden && event.key === "ArrowLeft") viewer.querySelector("[data-prev]").click(); if (!viewer.hidden && event.key === "ArrowRight") viewer.querySelector("[data-next]").click(); if (event.key === "Escape") { if (!viewer.hidden) closeOverlay(viewer); if (!gridOverlay.hidden) closeOverlay(gridOverlay); } });
  document.addEventListener("fullscreenchange", () => { if (!fullscreenElement()) { if (!viewer.hidden) closeOverlay(viewer); if (!gridOverlay.hidden) closeOverlay(gridOverlay); } });
  try { const saved = Number(localStorage.getItem("noema-inspiration-global-rows")); if (saved >= 2 && saved <= 4) { rows.value = String(saved); gridTrack.style.setProperty("--rows", String(saved)); } } catch {}

  fullscreen.addEventListener("click", () => openSequence(false).catch(console.error));
  fullscreenAll.addEventListener("click", () => openSequence(true).catch(console.error));
  grid.addEventListener("click", () => openGrid(false).catch(console.error));
  gridAll.addEventListener("click", () => openGrid(true).catch(console.error));
  load().catch((error) => console.error("Inspiration global modes:", error));
})();
