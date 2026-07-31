(() => {
  "use strict";

  const pathname = window.location.pathname.replace(/\.html$/i, "").replace(/\/$/, "") || "/";
  const scope = pathname === "/inspiration" ? "inspiration" : pathname === "/buildingsite" ? "buildingsite" : "";
  if (!scope) return;

  const collectionPath = scope === "inspiration" ? "inspirations" : "buildingsites";
  const downloadIcon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v12"></path><path d="m7.5 10.5 4.5 4.5 4.5-4.5"></path><path d="M5 20h14"></path>
    </svg>`;

  function installStyles() {
    if (document.getElementById("noema-gallery-download-styles")) return;
    const style = document.createElement("style");
    style.id = "noema-gallery-download-styles";
    style.textContent = `
      .hero-actions.noema-album-actions { display:flex; flex-direction:column; gap:.55rem; min-width:130px; }
      .album-download-button {
        display:inline-flex; align-items:center; justify-content:center; gap:.55rem;
        min-width:130px; min-height:42px; padding:.65rem 1rem;
        border:1px solid #4a7a5e; border-radius:10px;
        color:#4a7a5e; background:transparent; font-weight:650; white-space:nowrap;
        transition:transform .18s ease, opacity .18s ease, color .18s ease, border-color .18s ease;
      }
      .album-download-button:hover { color:#3f684f; background:transparent; border-color:#3f684f; transform:translateY(-2px); }
      .album-download-button:active { transform:scale(.98); }
      .album-download-button svg { width:16px; height:16px; flex:0 0 auto; }
      html[data-theme="dark"] .album-download-button { color:#8ab4a1; background:transparent; border-color:#8ab4a1; }
      html[data-theme="dark"] .album-download-button:hover { color:#9bc3b1; background:transparent; border-color:#9bc3b1; }
      .noema-viewer-download svg { width:17px; height:17px; display:block; margin:auto; }
      .noema-viewer-download.is-busy { opacity:.55; cursor:wait; }
      @media (max-width:760px) {
        .hero-actions.noema-album-actions { width:100%; margin-top:1.5rem; }
        .hero-actions.noema-album-actions .album-download-button { width:100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function currentAlbumId() {
    const match = String(window.location.hash || "").match(/^#album=(.+)$/);
    if (!match) return "";
    try { return decodeURIComponent(match[1]); } catch { return ""; }
  }

  function albumDownloadUrl(id) {
    const url = new URL(`/api/${collectionPath}/${encodeURIComponent(id)}/download`, window.location.origin);
    const token = new URLSearchParams(window.location.search).get("gallery");
    if (token) url.searchParams.set("gallery", token);
    return url.href;
  }

  function ensureAlbumButton() {
    let button = document.getElementById("albumDownloadButton");
    const addButton = document.getElementById("openAdd");
    const hero = document.querySelector(".hero");
    const albumView = document.getElementById("albumView");
    if (!hero || !albumView) return null;

    let actions = addButton?.closest(".hero-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "hero-actions noema-album-actions";
      if (addButton) {
        addButton.before(actions);
        actions.appendChild(addButton);
      } else {
        hero.appendChild(actions);
      }
    } else {
      actions.classList.add("noema-album-actions");
    }

    if (!button) {
      button = document.createElement("button");
      button.id = "albumDownloadButton";
      button.type = "button";
      button.className = "album-download-button";
      button.innerHTML = `${downloadIcon}<span>Download album</span>`;
      button.setAttribute("aria-label", "Download the complete album as a ZIP archive");
      const insertionPoint = addButton && addButton.parentElement === actions ? addButton.nextSibling : actions.firstChild;
      actions.insertBefore(button, insertionPoint);
      button.addEventListener("click", () => {
        const id = currentAlbumId();
        if (!id) return;
        const link = document.createElement("a");
        link.href = albumDownloadUrl(id);
        link.download = "";
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    }

    button.hidden = albumView.hidden || !currentAlbumId();
    return button;
  }

  function fileExtension(url, type) {
    try {
      const extension = new URL(url, window.location.origin).pathname.match(/\.[a-z0-9]{1,10}$/i)?.[0];
      if (extension) return extension.toLowerCase();
    } catch {}
    const byType = {
      "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
      "image/heic": ".heic", "image/heif": ".heif", "video/mp4": ".mp4", "video/webm": ".webm",
    };
    return byType[type] || ".bin";
  }

  function safeFilePart(value) {
    return String(value || "image")
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "image";
  }

  async function downloadCurrentImage(button) {
    const image = document.getElementById("viewerImage");
    const source = image?.currentSrc || image?.src || "";
    if (!source || button.classList.contains("is-busy")) return;
    button.classList.add("is-busy");
    button.disabled = true;
    try {
      const response = await fetch(source, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const blob = await response.blob();
      const title = document.getElementById("viewerTitle")?.textContent || document.getElementById("albumTitle")?.textContent || "image";
      const index = String(image.alt || "").match(/(\d+)\s*$/)?.[1] || "1";
      const filename = `${safeFilePart(title)}-${String(index).padStart(2, "0")}${fileExtension(source, blob.type)}`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (error) {
      button.title = error.message || "The image could not be downloaded.";
      window.setTimeout(() => { button.title = "Download current image"; }, 3000);
    } finally {
      button.disabled = false;
      button.classList.remove("is-busy");
    }
  }

  function ensureViewerButton() {
    if (document.getElementById("viewerDownloadButton")) return;
    const fullscreen = document.getElementById("fullscreenButton");
    const actions = fullscreen?.closest(".viewer-actions");
    if (!fullscreen || !actions) return;
    const button = document.createElement("button");
    button.id = "viewerDownloadButton";
    button.type = "button";
    button.className = "viewer-fullscreen noema-viewer-download";
    button.innerHTML = downloadIcon;
    button.title = "Download current image";
    button.setAttribute("aria-label", "Download current image");
    fullscreen.before(button);
    button.addEventListener("click", () => downloadCurrentImage(button));
  }

  function refresh() {
    ensureAlbumButton();
    ensureViewerButton();
  }

  function setup() {
    installStyles();
    refresh();
    const albumView = document.getElementById("albumView");
    if (albumView) new MutationObserver(refresh).observe(albumView, { attributes: true, attributeFilter: ["hidden"] });
    new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("hashchange", refresh);
    window.addEventListener("popstate", refresh);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();
})();
