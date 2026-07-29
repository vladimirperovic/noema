/* NOEMA — Unified Header, Menu, Theme Switcher, Page Width & Footer */
(() => {
  "use strict";

  const galleryToken = new URLSearchParams(window.location.search).get("gallery") || "";
  const publicGalleryMode = Boolean(galleryToken) && ["/buildingsite", "/buildingsite/", "/buildingsite.html", "/inspiration", "/inspiration/", "/inspiration.html"].includes(window.location.pathname);
  const galleryHref = (pathname) => `${pathname}?gallery=${encodeURIComponent(galleryToken)}`;

  // CSS injection for .theme-fab, menu overlay, page width & footer styling if not present
  if (!document.getElementById("noema-common-styles")) {
    const style = document.createElement("style");
    style.id = "noema-common-styles";
    style.textContent = `
      html[data-width="wide"] {
        --maxw: 92vw !important;
      }
      html, body, #shell, #shell-inner {
        width: 100% !important;
        max-width: 100% !important;
      }
      html[data-width="wide"] .wrap,
      html[data-width="wide"] .board-inner,
      html[data-width="wide"] .footer,
      html[data-width="wide"] .grid,
      html[data-width="wide"] .panel,
      html[data-width="wide"] .library-tools,
      html[data-width="wide"] main {
        max-width: 92vw !important;
        width: 92% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      .theme-fab {
        position: fixed; top: calc(1rem + 46px + 10px); right: 1rem; z-index: 1001;
        display: flex; align-items: center; justify-content: center;
        width: 46px; height: 46px; padding: 0;
        background: var(--paper-3, var(--card, #fff)); border: 1px solid var(--ink-line-2, var(--line-2, rgba(26,26,31,0.20))); border-radius: 12px;
        cursor: pointer; box-shadow: 0 4px 18px -8px rgba(0,0,0,0.30);
        font-family: var(--font-mono, monospace); font-size: 1.15rem; line-height: 1; color: var(--ink-4, var(--muted, #706c66));
        transition: border-color 0.2s, background 0.3s, color 0.2s;
      }
      .theme-fab:hover { border-color: var(--beacon, #e8b07d); color: var(--beacon, #e8b07d); }

      .burger {
        position: fixed; top: 1rem; right: 1rem; z-index: 1001;
        display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 6px;
        width: 46px; height: 46px; padding: 11px 9px;
        background: var(--paper-3, var(--card, #fff)); border: 1px solid var(--ink-line-2, var(--line-2, rgba(26,26,31,0.20))); border-radius: 12px;
        cursor: pointer; box-shadow: 0 4px 18px -8px rgba(0,0,0,0.30);
        transition: border-color 0.2s, background 0.3s;
      }
      .burger:hover { border-color: var(--beacon, #e8b07d); }
      .burger span { display: block; width: 24px; height: 2px; background: var(--ink, #f4efe6); border-radius: 2px; transition: all 0.3s cubic-bezier(.15, .2, .1, 1); }
      .burger span:last-child { width: 16px; }

      #shell {
        position: relative; z-index: 2; min-height: 100vh; background: var(--paper);
        transform-origin: center center;
        transition: transform .8s cubic-bezier(.15, .2, .1, 1), border-radius .8s cubic-bezier(.15, .2, .1, 1), box-shadow .8s cubic-bezier(.15, .2, .1, 1);
      }
      body.menu-fixed { overflow: hidden; }
      body.menu-fixed #shell {
        position: fixed; top: 0; left: 0; right: 0; height: 100vh; height: 100dvh;
        overflow: hidden; border-radius: 18px;
      }
      body.menu-pushed #shell {
        transform: perspective(1400px) translateX(-50vw) rotateY(11deg) scale(.84);
        box-shadow: 0 0 90px rgba(0,0,0,.55), 0 30px 60px rgba(0,0,0,.4);
        will-change: transform;
      }
      .shell-scrim {
        position: absolute; inset: 0; background: rgba(14,14,16,.30);
        opacity: 0; visibility: hidden;
        transition: opacity .8s cubic-bezier(.15, .2, .1, 1), visibility .8s cubic-bezier(.15, .2, .1, 1);
        z-index: 50000; cursor: pointer;
      }
      body.menu-pushed .shell-scrim { opacity: 1; visibility: visible; }

      .menu-overlay {
        box-sizing: border-box; position: fixed; inset: 0; z-index: 1;
        background: #0e0e10; color: #f5f1ea;
        display: flex; flex-direction: column; justify-content: center; align-items: flex-end;
        text-align: right; padding: clamp(70px,11vh,110px) clamp(24px,7vw,48px);
      }
      .menu-close {
        position: absolute; top: 30px; right: 26px; background: none; border: none;
        color: #f5f1ea; cursor: pointer; padding: 10px; opacity: 0;
        transform: translateX(20px) rotate(-90deg);
        transition: opacity .8s cubic-bezier(.15, .2, .1, 1) .15s, transform .8s cubic-bezier(.15, .2, .1, 1) .15s;
      }
      .menu-overlay.is-open .menu-close { opacity: .6; transform: translateX(0) rotate(0); }
      .menu-close:hover { opacity: 1 !important; transform: rotate(90deg); }
      .menu-close svg { width: 28px; height: 28px; stroke-width: 1.5; }

      .menu-nav { display: flex; flex-direction: column; align-items: flex-end; gap: clamp(3px,1.1vh,10px); }
      .menu-link {
        font-family: var(--font-display, 'Fraunces', Georgia, serif); font-size: clamp(16px,3vw,20px); font-weight: 300; line-height: 1.1;
        color: #f5f1ea; text-decoration: none; opacity: 0; transform: translateX(40px);
        transition: opacity .8s cubic-bezier(.15, .2, .1, 1), transform .8s cubic-bezier(.15, .2, .1, 1), color .25s;
      }
      .menu-link .ml-tag { color: #6f6a62; font-family: var(--font-mono, monospace); font-size: 0.55em; letter-spacing: 0.1em; text-transform: uppercase; margin-left: 0.5em; }
      .menu-link:hover { color: #d7b584; }
      .menu-overlay.is-open .menu-link { opacity: 1; transform: translateX(0); }
      .menu-link:nth-child(1){transition-delay:.10s}
      .menu-link:nth-child(2){transition-delay:.14s}
      .menu-link:nth-child(3){transition-delay:.18s}
      .menu-link:nth-child(4){transition-delay:.22s}
      .menu-link:nth-child(5){transition-delay:.26s}
      .menu-link:nth-child(6){transition-delay:.30s}
      .menu-link:nth-child(7){transition-delay:.34s}
      .menu-link:nth-child(8){transition-delay:.38s}
      .menu-link:nth-child(9){transition-delay:.42s}
      .menu-link:nth-child(10){transition-delay:.46s}
      .menu-archive {
        margin-top: clamp(14px,3.5vh,26px); display: inline-flex; align-items: center; gap: 0.55em;
        align-self: flex-end; font-family: var(--font-display, 'Fraunces', Georgia, serif); font-size: clamp(15px,2.5vw,17px);
        font-weight: 300; color: #d7b584; text-decoration: none; padding-bottom: 4px;
        border-bottom: 1px solid rgba(215,181,132,.3);
        opacity: 0; transform: translateX(40px);
        transition: opacity .8s cubic-bezier(.15, .2, .1, 1) .46s, transform .8s cubic-bezier(.15, .2, .1, 1) .46s, color .25s;
      }
      .menu-archive svg { width: 0.85em; height: 0.85em; stroke: currentColor; fill: none; stroke-width: 1.6; }
      .menu-archive:hover { color: #ecc998; }
      .menu-overlay.is-open .menu-archive { opacity: 1; transform: translateX(0); }
      .menu-notes { margin-top: clamp(8px,1.6vh,12px); transition: opacity .8s cubic-bezier(.15, .2, .1, 1) .5s, transform .8s cubic-bezier(.15, .2, .1, 1) .5s, color .25s; }
      .menu-documents { margin-top: clamp(8px,1.6vh,12px); transition: opacity .8s cubic-bezier(.15, .2, .1, 1) .54s, transform .8s cubic-bezier(.15, .2, .1, 1) .54s, color .25s; }
      .menu-links-item { margin-top: clamp(8px,1.6vh,12px); transition: opacity .8s cubic-bezier(.15, .2, .1, 1) .55s, transform .8s cubic-bezier(.15, .2, .1, 1) .55s, color .25s; }
      .menu-foot {
        margin-top: clamp(20px,5vh,38px); font-family: var(--font-mono, monospace);
        letter-spacing: .22em; text-transform: uppercase; color: #6f6a62;
        opacity: 0; transform: translateX(40px);
        transition: opacity .8s cubic-bezier(.15, .2, .1, 1) .58s, transform .8s cubic-bezier(.15, .2, .1, 1) .58s;
      }
      .menu-overlay.is-open .menu-foot { opacity: 1; transform: translateX(0); }
      .menu-foot-name { font-size: 13px; font-weight: 600; margin-bottom: 3px; }

      .footer {
        max-width: var(--maxw, 1400px); margin: 0 auto; padding: 1.75rem var(--gut, 2rem) 3rem;
        border-top: 1px solid var(--ink-line, rgba(244,239,230,0.08));
        display: flex; justify-content: space-between; align-items: center;
        flex-wrap: wrap; gap: 1rem;
        font-family: var(--font-mono, monospace); font-size: 0.72rem; color: var(--ink-4, #9b958a);
      }
      .footer em { font-family: var(--font-display, 'Fraunces', serif); font-style: italic; color: var(--beacon, #e8b07d); }
      .footer-left { display: inline-flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .footer .sys-sep { color: var(--ink-line-2, rgba(244,239,230,0.14)); }
      .footer .sys-stats { color: var(--ink-4, #9b958a); letter-spacing: 0.01em; }
      .footer .sys-stats b { color: var(--beacon-2, #d4a574); font-weight: 600; }
      .footer-theme {
        background: none; border: 1px solid var(--ink-line, rgba(244,239,230,0.08)); cursor: pointer; color: var(--ink-4, #9b958a);
        font-family: var(--font-mono, monospace); font-size: 1rem; line-height: 1;
        display: inline-grid; place-items: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;
        transition: color 0.2s, border-color 0.2s, background 0.2s;
      }
      .footer-theme:hover, .footer-theme.active { color: var(--beacon, #e8b07d); border-color: var(--beacon, #e8b07d); background: var(--beacon-soft, rgba(232,176,125,0.10)); }
    `;
    document.head.appendChild(style);
  }

  const STANDARD_MENU_CONTENT = `
    <button class="menu-close" id="closeMobile" type="button" aria-label="Close menu">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>

    <a href="/" class="menu-link" style="margin-bottom: 1.5rem; color: #d7b584;">NOEMA</a>

    <nav class="menu-nav">
      <a href="/ai-projects" class="menu-link">AI Projects<span class="ml-tag">Workspace</span></a>
      <a href="/buildingsite" class="menu-link">Building<span class="ml-tag">sites</span></a>
      <a href="/stats" class="menu-link">Stats<span class="ml-tag">Analytics</span></a>
    </nav>

    <a href="/arhiva" class="menu-archive">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4" stroke-linecap="round"/></svg>
      Archive
    </a>

    <a href="/notes" class="menu-archive menu-notes">
      <svg viewBox="0 0 24 24"><path d="M5 3h9l5 5v13a0 0 0 0 1 0 0H5a0 0 0 0 1 0 0V3z" stroke-linejoin="round"/><path d="M14 3v5h5M8 13h8M8 17h5" stroke-linecap="round"/></svg>
      Notes
    </a>

    <a href="/documents" class="menu-archive menu-documents">
      <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      Documents
    </a>

    <a href="/links" class="menu-archive menu-links-item">
      <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      Links
    </a>

    <a href="/inspiration" class="menu-archive menu-documents">
      <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 3 3 2-2 6 5"/></svg>
      Inspiration
    </a>

    <a href="/backup" class="menu-foot" style="text-decoration: none; cursor: pointer;">
      <div class="menu-foot-name">BACKUP</div>
    </a>
  `;

  const PUBLIC_GALLERY_MENU_CONTENT = `
    <button class="menu-close" id="closeMobile" type="button" aria-label="Close menu">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
    <nav class="menu-nav">
    </nav>
    <a href="${galleryHref("/buildingsite")}" class="menu-archive">Building Site</a>
    <a href="${galleryHref("/inspiration")}" class="menu-archive menu-notes">Inspiration</a>
  `;

  // Ensure DOM elements exist
  function ensureElements() {
    if (!document.getElementById("mobileBurger")) {
      document.body.insertAdjacentHTML("afterbegin", `
        <button class="burger" id="mobileBurger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu">
          <span></span><span></span><span></span>
        </button>
      `);
    }

    if (!document.getElementById("topTheme")) {
      const burger = document.getElementById("mobileBurger");
      if (burger) {
        burger.insertAdjacentHTML("afterend", `
          <button class="theme-fab" id="topTheme" type="button" title="Change theme" aria-label="Change theme">
            <span class="theme-icon" id="topThemeIcon">☾</span>
          </button>
        `);
      }
    }

    let menu = document.getElementById("mobileMenu");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "menu-overlay";
      menu.id = "mobileMenu";
      menu.setAttribute("role", "dialog");
      menu.setAttribute("aria-modal", "true");
      menu.setAttribute("aria-label", "Menu");
      document.body.appendChild(menu);
    }
    // Standardize menu HTML across all subpages
    menu.innerHTML = publicGalleryMode ? PUBLIC_GALLERY_MENU_CONTENT : STANDARD_MENU_CONTENT;

    if (!document.querySelector("footer.footer")) {
      const container = document.querySelector("main") || document.querySelector(".wrap") || document.body;
      container.insertAdjacentHTML("beforeend", publicGalleryMode ? `
        <footer class="footer">
          <span class="footer-left">Example Studio · public galleries</span>
          <div><button class="footer-theme" id="footerTheme" type="button" title="Change theme" aria-label="Change theme"><span class="theme-icon" id="ftIcon">☾</span></button></div>
        </footer>
      ` : `
        <footer class="footer">
          <span class="footer-left">
            Noema · <em>thought at your fingertips</em>
            <span class="sys-sep">|</span>
            <span class="sys-stats" id="sysStats" title="Server resources">CPU: <b>—</b> · RAM: <b>—</b> · Disk: <b>—</b></span>
            <span class="sys-sep">|</span>
            <a href="/help" class="sys-stats" style="text-decoration: none; cursor: pointer;">help</a>
            <span class="sys-sep">|</span>
            <a href="/logout" class="sys-stats" style="text-decoration: none; cursor: pointer;">logout</a>
          </span>
          <div style="display:inline-flex; gap:0.5rem; align-items:center;">
            <button class="footer-theme" id="pageWidth" type="button" title="Change page width (90% or normal)" aria-label="Page width" style="width:auto; padding: 0 8px; font-weight:600; font-size:0.75rem;">WIDTH</button>
            <button class="footer-theme" id="fontDec" type="button" title="Decrease text" aria-label="Decrease text">
              <span style="font-size: 0.85em; font-family: var(--font-sans); font-weight:600;">A</span>
            </button>
            <button class="footer-theme" id="fontReset" type="button" title="Reset text size" aria-label="Reset text size" style="width:auto; padding: 0 8px;">
              <span style="font-size: 0.85em; font-family: var(--font-sans); font-weight:600;">100%</span>
            </button>
            <button class="footer-theme" id="fontInc" type="button" title="Increase text" aria-label="Increase text">
              <span style="font-size: 1.25em; font-family: var(--font-sans); font-weight:600;">A</span>
            </button>
            <span class="sys-sep" style="margin: 0 20px;">|</span>
            <button class="footer-theme" id="footerTheme" type="button" title="Change theme" aria-label="Change theme">
              <span class="theme-icon" id="ftIcon">☾</span>
            </button>
          </div>
        </footer>
      `);
    } else {
      // Ensure pageWidth button exists in existing footer if not present
      const footerControls = document.querySelector("footer.footer > div");
      if (footerControls && !document.getElementById("pageWidth")) {
        footerControls.insertAdjacentHTML("afterbegin", `
          <button class="footer-theme" id="pageWidth" type="button" title="Change page width (90% or normal)" aria-label="Page width" style="width:auto; padding: 0 8px; font-weight:600; font-size:0.75rem;">WIDTH</button>
        `);
      }
    }
  }

  // Theme management: automatic based on time of day (night = dark 19:00-07:00, day = light 07:00-19:00), with manual override
  function getAutoTheme() {
    const hour = new Date().getHours();
    return (hour >= 19 || hour < 7) ? "dark" : "light";
  }

  function getEffectiveTheme() {
    try {
      const manual = localStorage.getItem("noema-theme-manual");
      if (manual === "dark" || manual === "light") return manual;
    } catch (e) {}
    return getAutoTheme();
  }

  function applyTheme(theme, isManual = false) {
    const dark = theme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try {
      localStorage.setItem("noema-theme", dark ? "dark" : "light");
      if (isManual) {
        localStorage.setItem("noema-theme-manual", dark ? "dark" : "light");
      }
    } catch (e) {}
    document.querySelectorAll(".theme-icon, #ftIcon, #topThemeIcon").forEach(el => { el.textContent = dark ? "☀" : "☾"; });
    window.dispatchEvent(new CustomEvent("noema-theme-change", { detail: { theme: dark ? "dark" : "light" } }));
  }

  function toggleTheme(e) {
    if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); }
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next, true);
  }

  function initTheme() {
    const theme = getEffectiveTheme();
    applyTheme(theme, false);
    ["footerTheme", "topTheme", "theme", "themeButton", "themeToggle"].forEach(id => {
      document.querySelectorAll("#" + id).forEach(btn => {
        if (btn && !btn._themeBound) {
          btn.addEventListener("click", toggleTheme);
          btn._themeBound = true;
        }
      });
    });
    window.applyNoemaTheme = applyTheme;
    window.toggleNoemaTheme = toggleTheme;

    let autoThemeTimer = null;

    function scheduleNextAutoThemeSwitch() {
      if (autoThemeTimer) { clearTimeout(autoThemeTimer); autoThemeTimer = null; }
      try {
        if (localStorage.getItem("noema-theme-manual")) return;
      } catch (e) {}

      const now = new Date();
      const hour = now.getHours();
      const nextSwitch = new Date(now);

      if (hour >= 7 && hour < 19) {
        nextSwitch.setHours(19, 0, 0, 0);
      } else {
        if (hour >= 19) nextSwitch.setDate(nextSwitch.getDate() + 1);
        nextSwitch.setHours(7, 0, 0, 0);
      }

      const msUntilSwitch = Math.max(1000, nextSwitch.getTime() - now.getTime());
      autoThemeTimer = setTimeout(() => {
        try {
          if (!localStorage.getItem("noema-theme-manual")) {
            applyTheme(getAutoTheme(), false);
          }
        } catch (e) {}
        scheduleNextAutoThemeSwitch();
      }, msUntilSwitch);
    }

    function checkAutoThemeOnVisibility() {
      if (document.hidden) return;
      try {
        if (!localStorage.getItem("noema-theme-manual")) {
          const autoTheme = getAutoTheme();
          if (document.documentElement.getAttribute("data-theme") !== autoTheme) {
            applyTheme(autoTheme, false);
          }
          scheduleNextAutoThemeSwitch();
        }
      } catch (e) {}
    }

    scheduleNextAutoThemeSwitch();
    document.addEventListener("visibilitychange", checkAutoThemeOnVisibility);
    window.addEventListener("focus", checkAutoThemeOnVisibility);
  }

  // Page Width Toggle (Normal vs Wide 92%)
  function applyPageWidth(mode) {
    const isWide = mode === "wide";
    if (isWide) {
      document.documentElement.setAttribute("data-width", "wide");
    } else {
      document.documentElement.removeAttribute("data-width");
    }
    document.querySelectorAll("#pageWidth").forEach(btn => btn.classList.toggle("active", isWide));
  }

  function initPageWidth() {
    const saved = localStorage.getItem("noema-page-width") || "normal";
    applyPageWidth(saved);
    document.querySelectorAll("#pageWidth").forEach(btn => {
      if (!btn._widthBound) {
        btn.addEventListener("click", () => {
          const next = document.documentElement.getAttribute("data-width") === "wide" ? "normal" : "wide";
          try { localStorage.setItem("noema-page-width", next); } catch (e) {}
          applyPageWidth(next);
        });
        btn._widthBound = true;
      }
    });
  }

  // Font Scale
  let fontScale = Number(localStorage.getItem("noema-font-scale")) || 1;
  function applyFontScale(scale) {
    document.documentElement.style.fontSize = (16 * scale) + "px";
    document.body.style.fontSize = (16 * scale) + "px";
  }
  function initFontScale() {
    applyFontScale(fontScale);
    const decBtn = document.getElementById("fontDec");
    const incBtn = document.getElementById("fontInc");
    const resBtn = document.getElementById("fontReset");
    if (decBtn && !decBtn._bound) {
      decBtn.addEventListener("click", () => {
        fontScale = Math.max(0.4, fontScale - 0.3);
        try { localStorage.setItem("noema-font-scale", fontScale); } catch (e) {}
        applyFontScale(fontScale);
      });
      decBtn._bound = true;
    }
    if (incBtn && !incBtn._bound) {
      incBtn.addEventListener("click", () => {
        fontScale = Math.min(2.5, fontScale + 0.3);
        try { localStorage.setItem("noema-font-scale", fontScale); } catch (e) {}
        applyFontScale(fontScale);
      });
      incBtn._bound = true;
    }
    if (resBtn && !resBtn._bound) {
      resBtn.addEventListener("click", () => {
        fontScale = 1;
        try { localStorage.setItem("noema-font-scale", fontScale); } catch (e) {}
        applyFontScale(fontScale);
      });
      resBtn._bound = true;
    }
  }

  // Server system resources
  function fmtGB(bytes) { return (bytes / 1073741824).toFixed(1); }
  async function loadSystem() {
    const el = document.getElementById("sysStats");
    if (!el) return;
    try {
      const res = await fetch("/api/system").then(r => r.json());
      const cpu = res.cpu ? `${res.cpu.percent}%` : "—";
      const ram = res.mem ? `${res.mem.percent}%` : "—";
      const disk = res.disk ? `${res.disk.percent}%` : "—";
      el.innerHTML = `CPU: <b>${cpu}</b> · RAM: <b>${ram}</b> · Disk: <b>${disk}</b>`;
      const parts = [];
      if (res.cpu) parts.push(`CPU ${res.cpu.cores} cores`);
      if (res.mem) parts.push(`RAM ${fmtGB(res.mem.used)}/${fmtGB(res.mem.total)} GB`);
      if (res.disk) parts.push(`Disk ${fmtGB(res.disk.used)}/${fmtGB(res.disk.total)} GB`);
      el.title = parts.join(" · ") || "Server resources";
    } catch (err) {
      el.innerHTML = `<span style="font-style:italic">system unavailable</span>`;
    }
  }

  // 3D Push menu logic (Salient reveal)
  function initMenu() {
    const burger = document.getElementById("mobileBurger");
    const overlay = document.getElementById("mobileMenu");
    const closeBtn = document.getElementById("closeMobile");
    if (!burger || !overlay || burger._menuInited) return;
    burger._menuInited = true;

    if (!document.getElementById("shell")) {
      const shell = document.createElement("div");
      shell.id = "shell";
      const inner = document.createElement("div");
      inner.id = "shell-inner";
      while (document.body.firstChild) inner.appendChild(document.body.firstChild);
      shell.appendChild(inner);
      const scrim = document.createElement("div");
      scrim.className = "shell-scrim";
      scrim.setAttribute("aria-hidden", "true");
      shell.appendChild(scrim);
      document.body.appendChild(shell);
      document.body.appendChild(overlay);
      const tpB = document.getElementById("tpBackdrop");
      if (tpB) document.body.appendChild(tpB);
      const tpM = document.getElementById("tpModal");
      if (tpM) document.body.appendChild(tpM);
    }

    const shell = document.getElementById("shell");
    const inner = document.getElementById("shell-inner");
    const scrim = shell.querySelector(".shell-scrim");

    let sy = 0, unfixTimer = null;
    const setExpanded = (o) => burger.setAttribute("aria-expanded", o ? "true" : "false");

    function open() {
      if (unfixTimer) { clearTimeout(unfixTimer); unfixTimer = null; }
      if (!document.body.classList.contains("menu-fixed")) {
        sy = window.scrollY || window.pageYOffset || 0;
        inner.style.transform = "translateY(" + (-sy) + "px)";
        document.body.classList.add("menu-fixed");
        void shell.offsetWidth;
      }
      requestAnimationFrame(() => {
        document.body.classList.add("menu-pushed");
        overlay.classList.add("is-open");
      });
      setExpanded(true);
    }

    function close() {
      overlay.classList.remove("is-open");
      document.body.classList.remove("menu-pushed");
      setExpanded(false);
      if (unfixTimer) clearTimeout(unfixTimer);
      unfixTimer = setTimeout(() => {
        document.body.classList.remove("menu-fixed");
        inner.style.transform = "";
        window.scrollTo(0, sy);
        unfixTimer = null;
      }, 850);
    }

    burger.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (scrim) scrim.addEventListener("click", close);
    overlay.querySelectorAll("a").forEach((l) => {
      l.addEventListener("click", (e) => {
        const href = l.getAttribute("href");
        const target = l.getAttribute("target");
        if (!href || href === "#" || target === "_blank") {
          close();
          return;
        }
        e.preventDefault();
        close();
        setTimeout(() => {
          window.location.href = href;
        }, 850);
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("menu-pushed")) close();
    });
  }

  function setup() {
    ensureElements();
    initTheme();
    initPageWidth();
    initFontScale();
    initMenu();
    if (!publicGalleryMode) {
      loadSystem();
      if (!window._noemaSysInterval) window._noemaSysInterval = setInterval(loadSystem, 5000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();
