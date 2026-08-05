(() => {
  "use strict";

  const pathname = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  if (pathname !== "/links") return;

  const STORAGE_COLUMNS = "noema-links-columns-v1";
  const STORAGE_VIEW = "noema-links-view-v1";
  const clampColumns = (value) => Math.max(3, Math.min(6, Number(value) || 4));
  const savedColumns = clampColumns(localStorage.getItem(STORAGE_COLUMNS) || 4);
  const savedView = localStorage.getItem(STORAGE_VIEW) === "table" ? "table" : "cards";

  function installStyles() {
    if (document.getElementById("noema-links-enhancement-styles")) return;
    const style = document.createElement("style");
    style.id = "noema-links-enhancement-styles";
    style.textContent = `
      .noema-links-viewbar{display:flex;align-items:center;gap:.75rem;padding:.9rem 1.5rem .15rem;flex-wrap:wrap}
      .noema-links-generate{display:inline-flex;align-items:center;gap:.55rem;min-height:38px;padding:0 .95rem;border:1px solid var(--beacon);border-radius:9px;background:var(--beacon-soft);color:var(--beacon-2);font:600 .76rem var(--font-mono,monospace);letter-spacing:.02em;cursor:pointer;transition:.2s}
      .noema-links-generate:hover:not(:disabled){background:var(--beacon);color:var(--paper)}
      .noema-links-generate:disabled{opacity:.5;cursor:default}
      .noema-links-generate svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8}
      .noema-links-thumb-status{min-width:120px;color:var(--ink-4);font:.64rem var(--font-mono,monospace)}
      .noema-links-viewspacer{flex:1}
      .noema-links-density{display:flex;align-items:center;gap:.55rem;color:var(--ink-3);font:.64rem var(--font-mono,monospace)}
      .noema-links-density input{width:108px;accent-color:var(--beacon)}
      .noema-links-density b{min-width:1.5em;color:var(--beacon-2);font-size:.76rem;text-align:center}
      .noema-links-switch{display:inline-flex;padding:3px;border:1px solid var(--ink-line);border-radius:8px;background:var(--paper-2)}
      .noema-links-switch button{height:30px;padding:0 .7rem;border:0;border-radius:6px;background:transparent;color:var(--ink-3);font:600 .65rem var(--font-mono,monospace);cursor:pointer}
      .noema-links-switch button.active{background:var(--paper-3);color:var(--beacon-2);box-shadow:0 1px 8px rgba(0,0,0,.08)}

      html[data-noema-links-view="cards"] #cards{grid-template-columns:repeat(var(--noema-link-columns,4),minmax(0,1fr))!important;align-items:stretch}
      html[data-noema-links-view="cards"] #cards .card{min-width:0;height:100%}
      html[data-noema-links-view="cards"] #cards .card-body{min-height:150px}
      #cards .card-title{min-width:0}
      #cards .title-text{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #cards .card-desc{display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;overflow:hidden!important;max-height:2.4em;min-height:2.4em}
      #cards .card-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #cards .card-thumb{background:linear-gradient(145deg,var(--paper-2),var(--paper-3))}
      #cards .card-thumb img{width:100%;height:100%;object-fit:cover}

      html[data-noema-links-view="table"] #cards{display:block!important;padding:.75rem 1.5rem 1.5rem!important}
      html[data-noema-links-view="table"] #cards .group-header{margin:.8rem 0 .35rem}
      html[data-noema-links-view="table"] #cards .card{display:grid!important;grid-template-columns:170px minmax(0,1fr);min-height:112px;margin-bottom:.55rem;border-radius:12px;overflow:hidden;transform:none!important}
      html[data-noema-links-view="table"] #cards .card-thumb{height:112px;aspect-ratio:auto!important;border-bottom:0!important;border-right:1px solid var(--ink-line)}
      html[data-noema-links-view="table"] #cards .card-body{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(170px,auto);grid-template-rows:auto auto;grid-template-areas:"title meta" "desc foot";align-content:center;align-items:center;gap:.35rem 1rem;min-height:0!important;padding:.8rem 1rem!important}
      html[data-noema-links-view="table"] #cards .card-title{grid-area:title;font-size:.9rem}
      html[data-noema-links-view="table"] #cards .card-meta{grid-area:meta;text-align:right}
      html[data-noema-links-view="table"] #cards .card-desc{grid-area:desc;min-height:0!important;max-height:1.4em!important;-webkit-line-clamp:1!important}
      html[data-noema-links-view="table"] #cards .card-foot{grid-area:foot;justify-content:flex-end;margin:0!important;padding:0!important;flex-wrap:nowrap}
      html[data-noema-links-view="table"] #cards .card-read{margin-left:0}

      @media(max-width:900px){html[data-noema-links-view="cards"] #cards{grid-template-columns:repeat(3,minmax(0,1fr))!important}.noema-links-viewspacer{display:none}}
      @media(max-width:680px){html[data-noema-links-view="cards"] #cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}.noema-links-viewbar{padding-left:1rem;padding-right:1rem}.noema-links-density{order:3;width:100%}.noema-links-density input{flex:1}.noema-links-thumb-status{display:none}html[data-noema-links-view="table"] #cards .card{grid-template-columns:104px minmax(0,1fr)}html[data-noema-links-view="table"] #cards .card-thumb{height:104px}html[data-noema-links-view="table"] #cards .card-body{display:flex!important;flex-direction:column;align-items:stretch;justify-content:center;gap:.25rem}html[data-noema-links-view="table"] #cards .card-meta{text-align:left}html[data-noema-links-view="table"] #cards .card-desc{display:none!important}html[data-noema-links-view="table"] #cards .card-foot{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function setColumns(value) {
    const columns = clampColumns(value);
    document.documentElement.style.setProperty("--noema-link-columns", columns);
    localStorage.setItem(STORAGE_COLUMNS, String(columns));
    document.getElementById("noemaLinksColumnValue")?.replaceChildren(String(columns));
    const slider = document.getElementById("noemaLinksColumns");
    if (slider) slider.value = String(columns);
  }

  function setView(value) {
    const view = value === "table" ? "table" : "cards";
    document.documentElement.dataset.noemaLinksView = view;
    localStorage.setItem(STORAGE_VIEW, view);
    document.querySelectorAll("[data-noema-links-view]").forEach((button) => button.classList.toggle("active", button.dataset.noemaLinksView === view));
  }

  async function api(path, options = {}) {
    const response = await fetch(path, { headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function thumbnailState() {
    const data = await api("/api/links");
    const links = Array.isArray(data.links) ? data.links : [];
    const missing = links.filter((link) => !String(link.image || "").trim());
    return { links, missing };
  }

  function updateButton(button, status, missingCount) {
    if (status) status.textContent = missingCount ? `${missingCount} bez slike` : "svi imaju thumbnail";
    if (!button.dataset.busy) {
      button.disabled = missingCount === 0;
      button.querySelector("span").textContent = missingCount ? `Generate thumbnails (${missingCount})` : "Thumbnails ready";
    }
  }

  async function refreshThumbnailState(button, status) {
    try {
      const state = await thumbnailState();
      updateButton(button, status, state.missing.length);
      return state;
    } catch (error) {
      status.textContent = error.message;
      return { links: [], missing: [] };
    }
  }

  async function generateMissing(button, status) {
    if (button.dataset.busy) return;
    button.dataset.busy = "1";
    button.disabled = true;
    const originalText = button.querySelector("span").textContent;
    try {
      const state = await thumbnailState();
      const targets = state.missing;
      if (!targets.length) return;
      let done = 0;
      let failed = 0;
      for (const link of targets) {
        button.querySelector("span").textContent = `Generating ${done + 1}/${targets.length}`;
        status.textContent = link.domain || link.title || "thumbnail";
        try {
          await api(`/api/links/${encodeURIComponent(link.id)}/thumbnail`, { method: "POST" });
        } catch (error) {
          failed += 1;
          console.warn("Noema thumbnail:", link.url, error.message);
        }
        done += 1;
      }
      status.textContent = failed ? `${done - failed} generated · ${failed} failed` : `${done} generated`;
      button.querySelector("span").textContent = failed ? "Retry missing thumbnails" : "Done — reloading…";
      setTimeout(() => location.reload(), 650);
    } catch (error) {
      status.textContent = error.message;
      button.querySelector("span").textContent = originalText;
    } finally {
      delete button.dataset.busy;
      button.disabled = false;
    }
  }

  function installToolbar() {
    if (document.getElementById("noemaLinksViewbar")) return true;
    const toolbar = document.getElementById("toolbar");
    if (!toolbar) return false;

    const bar = document.createElement("div");
    bar.id = "noemaLinksViewbar";
    bar.className = "noema-links-viewbar";
    bar.innerHTML = `
      <button class="noema-links-generate" id="noemaGenerateThumbnails" type="button" title="Generiše lokalni screenshot samo za linkove koji nemaju sliku.">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="15" rx="2"/><path d="m7 15 3-3 3 3 2-2 2 2M8 8h.01"/></svg>
        <span>Generate thumbnails</span>
      </button>
      <span class="noema-links-thumb-status" id="noemaThumbnailStatus">provjeravam…</span>
      <span class="noema-links-viewspacer"></span>
      <label class="noema-links-density" title="Broj kartica u jednom redu">
        <span>Cards per row</span>
        <input id="noemaLinksColumns" type="range" min="3" max="6" step="1" value="4">
        <b id="noemaLinksColumnValue">4</b>
      </label>
      <div class="noema-links-switch" aria-label="Links view">
        <button type="button" data-noema-links-view="cards">▦ Cards</button>
        <button type="button" data-noema-links-view="table">☷ Table</button>
      </div>`;
    toolbar.parentNode.insertBefore(bar, toolbar);

    const slider = document.getElementById("noemaLinksColumns");
    slider.addEventListener("input", () => setColumns(slider.value));
    document.querySelectorAll("[data-noema-links-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.noemaLinksView)));

    const generate = document.getElementById("noemaGenerateThumbnails");
    const status = document.getElementById("noemaThumbnailStatus");
    generate.addEventListener("click", () => generateMissing(generate, status));
    refreshThumbnailState(generate, status);
    return true;
  }

  installStyles();
  setColumns(savedColumns);
  setView(savedView);

  let attempts = 0;
  const boot = () => {
    attempts += 1;
    if (installToolbar()) return;
    if (attempts < 60) setTimeout(boot, 100);
  };
  boot();
})();
