/* NOEMA — Markdown support for Documents, backed by the encrypted Files library. */
(() => {
  "use strict";

  const MARKER_RE = /<!--\s*noema-markdown-file:([0-9a-f-]{36})\s*-->/i;
  const MODE_KEY = "noema-markdown-mode";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeHref(value) {
    const href = String(value || "").trim();
    if (!href) return null;
    if (/^(?:https?:|mailto:)/i.test(href)) return href;
    if (/^(?:\/|#|\.\/|\.\.\/)/.test(href)) return href;
    return null;
  }

  function renderInline(value) {
    const tokens = [];
    let source = String(value ?? "");
    const keep = (html) => {
      const token = `NOEMAMDTOKEN${tokens.length}XYZ`;
      tokens.push(html);
      return token;
    };

    source = source.replace(/`([^`\n]+)`/g, (_, code) => keep(`<code>${escapeHtml(code)}</code>`));
    source = source.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/g, (_, label, rawHref, title) => {
      const href = safeHref(rawHref);
      if (!href) return escapeHtml(label);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return keep(`<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    });

    let html = escapeHtml(source);
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
    html = html.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    tokens.forEach((tokenHtml, index) => {
      html = html.replaceAll(`NOEMAMDTOKEN${index}XYZ`, tokenHtml);
    });
    return html;
  }

  function splitTableRow(line) {
    let value = String(line || "").trim();
    if (value.startsWith("|")) value = value.slice(1);
    if (value.endsWith("|")) value = value.slice(0, -1);
    return value.split("|").map((cell) => cell.trim());
  }

  function isTableSeparator(line) {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
    const output = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        index += 1;
        continue;
      }

      const fence = trimmed.match(/^```\s*([\w+-]*)\s*$/);
      if (fence) {
        const language = fence[1] || "";
        const code = [];
        index += 1;
        while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
          code.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const className = language ? ` class="language-${escapeHtml(language)}"` : "";
        output.push(`<pre><code${className}>${escapeHtml(code.join("\n"))}</code></pre>`);
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        output.push("<hr>");
        index += 1;
        continue;
      }

      if (trimmed.startsWith(">")) {
        const quote = [];
        while (index < lines.length && /^\s*>/.test(lines[index])) {
          quote.push(lines[index].replace(/^\s*>\s?/, ""));
          index += 1;
        }
        output.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
        continue;
      }

      if (trimmed.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
        const header = splitTableRow(line);
        index += 2;
        const rows = [];
        while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
          rows.push(splitTableRow(lines[index]));
          index += 1;
        }
        const headHtml = header.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
        const bodyHtml = rows.map((row) => `<tr>${header.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("");
        output.push(`<div class="md-table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`);
        continue;
      }

      const listMatch = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
      if (listMatch) {
        const ordered = Boolean(listMatch[2]);
        const tag = ordered ? "ol" : "ul";
        const items = [];
        while (index < lines.length) {
          const match = lines[index].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
          if (!match || Boolean(match[2]) !== ordered) break;
          let itemText = match[3];
          const task = itemText.match(/^\[([ xX])\]\s+(.*)$/);
          if (task) {
            const checked = task[1].toLowerCase() === "x";
            itemText = `<label class="md-task"><input type="checkbox" disabled${checked ? " checked" : ""}> <span>${renderInline(task[2])}</span></label>`;
          } else {
            itemText = renderInline(itemText);
          }
          items.push(`<li>${itemText}</li>`);
          index += 1;
        }
        output.push(`<${tag}>${items.join("")}</${tag}>`);
        continue;
      }

      const paragraph = [trimmed];
      index += 1;
      while (index < lines.length) {
        const next = lines[index];
        const nextTrimmed = next.trim();
        if (!nextTrimmed) break;
        if (/^```/.test(nextTrimmed) || /^(#{1,6})\s+/.test(nextTrimmed) || /^\s*>/.test(next) || /^\s*(?:[-+*]|\d+\.)\s+/.test(next)) break;
        if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(nextTrimmed)) break;
        if (nextTrimmed.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) break;
        paragraph.push(nextTrimmed);
        index += 1;
      }
      output.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
    }

    return output.join("\n");
  }

  if (typeof globalThis !== "undefined") {
    globalThis.__NOEMA_MARKDOWN_TEST__ = { escapeHtml, safeHref, renderMarkdown };
  }

  if (typeof document === "undefined" || !/^\/documents(?:\.html)?\/?$/.test(location.pathname)) return;

  const docsById = new Map();
  let active = null;
  let syncTimer = null;
  let docsLoadPromise = null;

  function markerFileId(doc) {
    const match = String(doc?.body || "").match(MARKER_RE);
    return match ? match[1] : "";
  }

  async function apiJson(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary);
  }

  function textToBase64(text) {
    return bytesToBase64(new TextEncoder().encode(String(text ?? "")));
  }

  async function refreshDocuments() {
    const data = await apiJson("/api/documents");
    docsById.clear();
    for (const doc of data.documents || []) docsById.set(doc.id, doc);
    return docsById;
  }

  function activeDocumentId() {
    return document.querySelector("#sidebarList .sidebar-item.active [data-del-id]")?.dataset.delId || "";
  }

  function styleMarkdownUi() {
    if (document.getElementById("noema-markdown-styles")) return;
    const style = document.createElement("style");
    style.id = "noema-markdown-styles";
    style.textContent = `
      .noema-md-shell{display:flex;flex:1;min-height:420px;flex-direction:column;background:var(--paper,#fff)}
      .noema-md-toolbar{display:flex;align-items:center;gap:.45rem;padding:.55rem .75rem;border-bottom:1px solid var(--ink-line,rgba(0,0,0,.1));background:var(--paper-3,#fff);flex-wrap:wrap}
      .noema-md-toolbar button,.noema-md-toolbar a{border:1px solid var(--ink-line-2,rgba(0,0,0,.16));border-radius:7px;background:transparent;color:var(--ink-3,#666);padding:.36rem .62rem;font:600 .7rem/1 var(--font-mono,monospace);text-decoration:none;cursor:pointer}
      .noema-md-toolbar button:hover,.noema-md-toolbar a:hover,.noema-md-toolbar button.active{border-color:var(--beacon,#b87333);color:var(--beacon,#b87333);background:var(--beacon-soft,rgba(184,115,51,.08))}
      .noema-md-status{margin-left:auto;color:var(--ink-4,#999);font:.68rem/1 var(--font-mono,monospace)}
      .noema-md-workspace{display:grid;grid-template-columns:1fr 1fr;flex:1;min-height:0}
      .noema-md-editor{width:100%;min-height:420px;resize:none;border:0;border-right:1px solid var(--ink-line,rgba(0,0,0,.1));outline:0;background:var(--paper,#fff);color:var(--ink,#222);padding:1.25rem 1.35rem;font:400 .86rem/1.65 var(--font-mono,monospace);tab-size:2}
      .noema-md-preview{min-width:0;overflow:auto;padding:1.25rem 1.5rem;color:var(--ink-2,#333);line-height:1.7}
      .noema-md-preview h1,.noema-md-preview h2,.noema-md-preview h3,.noema-md-preview h4,.noema-md-preview h5,.noema-md-preview h6{color:var(--ink,#222);font-family:var(--font-display,serif);font-weight:500;line-height:1.25;margin:1.2em 0 .55em}
      .noema-md-preview h1{font-size:2rem}.noema-md-preview h2{font-size:1.55rem}.noema-md-preview h3{font-size:1.25rem}
      .noema-md-preview p{margin:.8em 0}.noema-md-preview ul,.noema-md-preview ol{padding-left:1.5rem;margin:.7em 0}.noema-md-preview li{margin:.28em 0}
      .noema-md-preview code{font-family:var(--font-mono,monospace);background:var(--paper-2,#f4f1eb);border:1px solid var(--ink-line,rgba(0,0,0,.08));border-radius:5px;padding:.08em .35em;color:var(--beacon-2,#9c6029)}
      .noema-md-preview pre{overflow:auto;background:var(--paper-2,#f4f1eb);border:1px solid var(--ink-line,rgba(0,0,0,.08));border-radius:10px;padding:1rem;margin:1rem 0}.noema-md-preview pre code{border:0;background:none;padding:0;color:var(--ink-2,#333)}
      .noema-md-preview blockquote{border-left:3px solid var(--beacon,#b87333);margin:1rem 0;padding:.2rem 0 .2rem 1rem;color:var(--ink-3,#666)}
      .noema-md-preview a{color:var(--azure,#3a6ea5)}.noema-md-preview hr{border:0;border-top:1px solid var(--ink-line-2,rgba(0,0,0,.16));margin:1.4rem 0}
      .md-table-wrap{overflow:auto;margin:1rem 0}.noema-md-preview table{border-collapse:collapse;width:100%;font-size:.92em}.noema-md-preview th,.noema-md-preview td{border:1px solid var(--ink-line-2,rgba(0,0,0,.16));padding:.45rem .6rem;text-align:left}.noema-md-preview th{background:var(--paper-2,#f4f1eb);color:var(--ink,#222)}
      .md-task{display:inline-flex;align-items:flex-start;gap:.35rem}.md-task input{margin-top:.34em;accent-color:var(--beacon,#b87333)}
      .noema-md-shell[data-mode="edit"] .noema-md-workspace{grid-template-columns:1fr}.noema-md-shell[data-mode="edit"] .noema-md-preview{display:none}.noema-md-shell[data-mode="edit"] .noema-md-editor{border-right:0}
      .noema-md-shell[data-mode="preview"] .noema-md-workspace{grid-template-columns:1fr}.noema-md-shell[data-mode="preview"] .noema-md-editor{display:none}
      @media(max-width:820px){.noema-md-workspace{grid-template-columns:1fr}.noema-md-editor{border-right:0;border-bottom:1px solid var(--ink-line,rgba(0,0,0,.1));min-height:300px}.noema-md-preview{min-height:300px}.noema-md-shell[data-mode="split"] .noema-md-workspace{display:block}}
    `;
    document.head.appendChild(style);
  }

  function originalToolbar() {
    return document.querySelector("#detailCol .doc-fmt-btn")?.parentElement || null;
  }

  function setOriginalEditorVisible(visible) {
    const body = document.getElementById("docBody");
    const toolbar = originalToolbar();
    if (body) body.style.display = visible ? "" : "none";
    if (toolbar) toolbar.style.display = visible ? "" : "none";
  }

  function setStatus(message, isError = false) {
    if (!active?.status) return;
    active.status.textContent = message;
    active.status.style.color = isError ? "var(--ember,#c0563b)" : "";
  }

  async function saveActive() {
    if (!active?.dirty || active.saving) return;
    const state = active;
    state.saving = true;
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = null;
    setStatus("Saving…");
    try {
      await apiJson(`/api/files/${encodeURIComponent(state.fileId)}/replace`, {
        method: "POST",
        body: JSON.stringify({
          name: state.fileName,
          mimeType: "text/markdown; charset=utf-8",
          data: textToBase64(state.editor.value),
        }),
      });
      state.dirty = false;
      setStatus("Saved");
    } catch (error) {
      setStatus(`Save failed: ${error.message}`, true);
    } finally {
      state.saving = false;
    }
  }

  function queueSave() {
    if (!active) return;
    active.dirty = true;
    setStatus("Unsaved");
    if (active.saveTimer) clearTimeout(active.saveTimer);
    active.saveTimer = setTimeout(saveActive, 800);
  }

  function applyMode(mode) {
    if (!active) return;
    const next = ["edit", "split", "preview"].includes(mode) ? mode : "split";
    active.shell.dataset.mode = next;
    active.modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === next));
    try { localStorage.setItem(MODE_KEY, next); } catch {}
  }

  async function deactivateMarkdown() {
    if (active) {
      await saveActive();
      active.shell.remove();
      active = null;
    }
    setOriginalEditorVisible(true);
  }

  async function activateMarkdown(doc, fileId) {
    if (active?.docId === doc.id && active.fileId === fileId) return;
    await deactivateMarkdown();
    styleMarkdownUi();

    const [metaData, response] = await Promise.all([
      apiJson(`/api/files/${encodeURIComponent(fileId)}`),
      fetch(`/api/files/${encodeURIComponent(fileId)}/content`, { cache: "no-store" }),
    ]);
    if (!response.ok) throw new Error(`Could not read Markdown file (HTTP ${response.status}).`);
    const text = await response.text();
    const file = metaData.file;
    if (!file || !/\.md$/i.test(file.name || "")) throw new Error("Linked file is not a Markdown file.");

    const detail = document.getElementById("detailCol");
    const body = document.getElementById("docBody");
    if (!detail || !body) return;

    setOriginalEditorVisible(false);
    const shell = document.createElement("section");
    shell.className = "noema-md-shell";
    shell.innerHTML = `
      <div class="noema-md-toolbar">
        <button type="button" data-mode="edit">Editor</button>
        <button type="button" data-mode="split">Split</button>
        <button type="button" data-mode="preview">Preview</button>
        <button type="button" data-action="save">Save</button>
        <a data-action="download" href="/api/files/${encodeURIComponent(fileId)}/content?download=1">Download .md</a>
        <span class="noema-md-status">Saved</span>
      </div>
      <div class="noema-md-workspace">
        <textarea class="noema-md-editor" spellcheck="true" aria-label="Markdown editor"></textarea>
        <article class="noema-md-preview" aria-label="Markdown preview"></article>
      </div>`;
    detail.insertBefore(shell, body);

    const editor = shell.querySelector(".noema-md-editor");
    const preview = shell.querySelector(".noema-md-preview");
    const status = shell.querySelector(".noema-md-status");
    const modeButtons = [...shell.querySelectorAll("[data-mode]")];
    editor.value = text;
    preview.innerHTML = renderMarkdown(text);

    active = {
      docId: doc.id,
      fileId,
      fileName: file.name,
      shell,
      editor,
      preview,
      status,
      modeButtons,
      dirty: false,
      saving: false,
      saveTimer: null,
    };

    editor.addEventListener("input", () => {
      preview.innerHTML = renderMarkdown(editor.value);
      queueSave();
    });
    editor.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        active.dirty = true;
        saveActive();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.setRangeText("  ", start, end, "end");
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    modeButtons.forEach((button) => button.addEventListener("click", () => applyMode(button.dataset.mode)));
    shell.querySelector('[data-action="save"]').addEventListener("click", () => {
      active.dirty = true;
      saveActive();
    });

    let storedMode = "split";
    try { storedMode = localStorage.getItem(MODE_KEY) || "split"; } catch {}
    applyMode(storedMode);
  }

  async function syncActiveDocument() {
    try {
      await (docsLoadPromise || (docsLoadPromise = refreshDocuments()));
      const id = activeDocumentId();
      if (!id) {
        await deactivateMarkdown();
        return;
      }
      let doc = docsById.get(id);
      if (!doc) {
        await refreshDocuments();
        doc = docsById.get(id);
      }
      const fileId = markerFileId(doc);
      if (!fileId) {
        await deactivateMarkdown();
        return;
      }
      await activateMarkdown(doc, fileId);
    } catch (error) {
      console.error("[noema] Markdown document error:", error);
      setStatus(error.message, true);
    }
  }

  function scheduleSync(delay = 0) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncActiveDocument();
    }, delay);
  }

  async function uploadMarkdown(file, input) {
    const uploadBtn = document.getElementById("uploadBtn");
    const uploadLabel = document.getElementById("uploadLabel");
    if (uploadBtn) uploadBtn.disabled = true;
    if (uploadLabel) uploadLabel.textContent = `Adding ${file.name}…`;
    let fileId = "";
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fileResult = await apiJson("/api/files", {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          description: "Markdown document",
          mimeType: file.type || "text/markdown; charset=utf-8",
          data: bytesToBase64(bytes),
        }),
      });
      fileId = fileResult.file.id;
      const marker = `<!-- noema-markdown-file:${fileId} -->`;
      await apiJson("/api/documents", {
        method: "POST",
        body: JSON.stringify({ title: file.name, body: marker }),
      });
      input.value = "";
      location.reload();
    } catch (error) {
      if (fileId) {
        try { await apiJson(`/api/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }); } catch {}
      }
      alert(`Markdown upload failed: ${error.message}`);
      if (uploadBtn) uploadBtn.disabled = false;
      if (uploadLabel) uploadLabel.textContent = "Upload";
    }
  }

  const fileInput = document.getElementById("fileInput");
  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const file = fileInput.files?.[0];
      if (!file || !/\.md$/i.test(file.name)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      uploadMarkdown(file, fileInput);
    }, true);
  }

  document.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest?.(".sidebar-del[data-del-id]");
    if (deleteButton) {
      const docId = deleteButton.dataset.delId;
      const doc = docsById.get(docId);
      const fileId = markerFileId(doc);
      if (fileId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!confirm("Delete this Markdown document and its .md file?")) return;
        try {
          if (active?.docId === docId) await deactivateMarkdown();
          await apiJson(`/api/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
          await apiJson(`/api/documents/${encodeURIComponent(docId)}`, { method: "DELETE" });
          location.reload();
        } catch (error) {
          alert(`Delete failed: ${error.message}`);
        }
        return;
      }
    }

    if (event.target.closest?.("#sidebarList .sidebar-item") && !deleteButton) {
      scheduleSync(0);
    }
  }, true);

  window.addEventListener("beforeunload", () => {
    if (active?.dirty) saveActive();
  });

  const sidebar = document.getElementById("sidebarList");
  if (sidebar) {
    new MutationObserver(() => scheduleSync(25)).observe(sidebar, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  docsLoadPromise = refreshDocuments().catch((error) => {
    console.error("[noema] Could not load Markdown document metadata:", error);
    return docsById;
  });
  scheduleSync(250);
})();
