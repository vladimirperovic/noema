(() => {
  "use strict";

  const pathname = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  const isMain = pathname === "/" || pathname === "/index";
  const sourcePages = new Set(["/documents", "/notes", "/links", "/inspiration", "/buildingsite", "/ai-projects", "/files"]);
  if ((!isMain && !sourcePages.has(pathname)) || new URLSearchParams(location.search).has("gallery")) return;

  const STORAGE_KEY = "noema-source-task-links-v1";
  const SOURCE_MARKER = "\u2063NOEMA_SOURCE:";
  const SOURCE_CONFIG = {
    document: { page: "/documents", label: "DOCUMENT", className: "document" },
    note: { page: "/notes", label: "NOTE", className: "note" },
    link: { page: "/links", label: "LINK", className: "link" },
    file: { page: "/files", label: "FILE", className: "file" },
    inspiration: { page: "/inspiration", label: "INSPIRATION", className: "inspiration" },
    "building-site": { page: "/buildingsite", label: "BUILDING SITE", className: "building-site" },
    "ai-project": { page: "/ai-projects", label: "AI PROJECT", className: "ai-project" },
  };

  let timer = null;
  let tasksCache = { at: 0, items: [] };
  let notesCache = { at: 0, items: [] };

  function loadLinked() {
    try { const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"); return value&&typeof value==="object"&&!Array.isArray(value)?value:{}; } catch { return {}; }
  }
  let linked = loadLinked();
  function saveLinked(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(linked))}catch{}}
  function normalizeSource(raw){if(!raw||typeof raw!=="object")return null;const type=String(raw.type||"");const id=String(raw.id||"");return SOURCE_CONFIG[type]&&id?{type,id}:null}
  function keyOf(source){return `${source.type}:${source.id}`}
  function hrefOf(source){const value=normalizeSource(source);return value?`${SOURCE_CONFIG[value.type].page}?open=${encodeURIComponent(value.id)}`:""}
  function encodedTitle(title,source){return `${title}\n${SOURCE_MARKER}${encodeURIComponent(JSON.stringify(source))}`}
  function stableHash(value){let hash=2166136261;for(const char of String(value||"")){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return(hash>>>0).toString(36)}
  function text(element,remove=""){if(!element)return"";const clone=element.cloneNode(true);if(remove)clone.querySelectorAll(remove).forEach(node=>node.remove());return clone.textContent.replace(/\s+/g," ").trim()}
  function flatten(data){return Object.values(data?.todos||{}).flatMap(group=>Array.isArray(group)?group:[])}

  async function loadTasks(force=false){if(!force&&Date.now()-tasksCache.at<2500&&tasksCache.items.length)return tasksCache.items;const response=await fetch("/api/todos",{headers:{Accept:"application/json"}});const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||"Tasks could not be loaded.");tasksCache={at:Date.now(),items:flatten(data)};return tasksCache.items}

  function installStyles(){if(document.getElementById("noema-source-task-styles"))return;const style=document.createElement("style");style.id="noema-source-task-styles";style.textContent=`
    .noema-task-button{cursor:pointer;white-space:nowrap}.noema-task-button.is-task-linked{color:var(--signal,#4a7a5e)!important;border-color:var(--signal,#4a7a5e)!important;background:rgba(74,122,94,.13)!important}.noema-task-button.is-task-pending{opacity:.65;pointer-events:none}.noema-task-compact{width:auto!important;min-width:48px;padding:0 8px!important;font-size:.66rem!important}.noema-task-toolbar{min-width:68px;justify-content:center}
    .task.noema-source-linked{--source-accent:var(--azure,#3a6ea5);border-color:color-mix(in srgb,var(--source-accent) 46%,var(--ink-line-2))!important;background:color-mix(in srgb,var(--source-accent) 7%,var(--paper-3))!important;box-shadow:inset 3px 0 0 color-mix(in srgb,var(--source-accent) 78%,transparent)}.task.noema-source-note{--source-accent:#8b6bb1}.task.noema-source-link{--source-accent:var(--signal,#4a7a5e)}.task.noema-source-file{--source-accent:var(--azure,#3a6ea5)}.task.noema-source-inspiration{--source-accent:var(--beacon,#b87333)}.task.noema-source-building-site{--source-accent:var(--ember,#c0563b)}.task.noema-source-ai-project{--source-accent:#6f68ae}.noema-source-link{color:var(--source-accent)!important;text-decoration:none;font-weight:560}.noema-source-badge{display:inline-flex;margin-left:.55rem;padding:.1rem .42rem;border:1px solid color-mix(in srgb,var(--source-accent) 46%,transparent);border-radius:99px;color:var(--source-accent);font:.56rem var(--font-mono,monospace);letter-spacing:.08em}.noema-source-focus{outline:2px solid var(--beacon,#b87333)!important;outline-offset:4px}
    .filter-pill.noema-add-label-selected{border-color:var(--signal,#4a7a5e)!important;background:color-mix(in srgb,var(--signal,#4a7a5e) 13%,transparent)!important;color:var(--signal,#4a7a5e)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--signal,#4a7a5e) 12%,transparent)}.noema-link-label-hint{padding:.15rem 1.5rem 0;color:var(--ink-4,#9b958a);font:.64rem var(--font-mono,monospace);letter-spacing:.02em}
  `;document.head.appendChild(style)}

  function setButton(button,source){const key=source?keyOf(source):"";const exists=Boolean(linked[key]);button.dataset.noemaTaskKey=key;button.classList.toggle("is-task-linked",exists);button.textContent=exists?"Task ✓":"Task";button.title=exists?"This record is already linked to a task.":"Add as a task for today."}
  async function addTask(source,title,button){const normalized=normalizeSource(source);const cleanTitle=String(title||"").replace(/\s+/g," ").trim();if(!normalized||!cleanTitle)return;const key=keyOf(normalized);if(linked[key])return setButton(button,normalized);button.disabled=true;button.classList.add("is-task-pending");button.textContent="Adding…";try{const response=await fetch("/api/todos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:encodedTitle(cleanTitle,normalized),day:"today",priority:"normal"})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||"Task could not be created.");linked[key]={taskId:data.todo?.id||"",title:cleanTitle,createdAt:Date.now()};saveLinked();tasksCache.at=0;setButton(button,normalized)}catch(error){button.textContent="Task";button.title=error.message}finally{button.disabled=false;button.classList.remove("is-task-pending")}}
  function bind(button,resolver){button.type="button";button.classList.add("noema-task-button");if(!button.dataset.noemaBound){button.dataset.noemaBound="1";button.addEventListener("click",async event=>{event.preventDefault();event.stopPropagation();const value=await resolver();if(value)await addTask({type:value.type,id:value.id},value.title,button)})}Promise.resolve(resolver()).then(value=>value&&setButton(button,{type:value.type,id:value.id})).catch(()=>{})}

  function addCardButton(actions,before,className,resolver,identity){if(!actions)return;let button=actions.querySelector(`.noema-task-button[data-noema-source="${identity}"]`);if(!button){button=document.createElement("button");button.className=className;button.dataset.noemaSource=identity;actions.insertBefore(button,before&&before.parentNode===actions?before:actions.firstElementChild)}bind(button,resolver)}

  async function noteSource(){const title=document.getElementById("detailTitle")?.textContent.trim();const body=document.getElementById("noteBody")?.value||"";if(!title)return null;try{if(Date.now()-notesCache.at>4000){const data=await fetch("/api/notes").then(response=>response.json());notesCache={at:Date.now(),items:Array.isArray(data.notes)?data.notes:[]}}const exact=notesCache.items.find(note=>String(note.title).trim()===title&&String(note.body||"")===body);const same=notesCache.items.filter(note=>String(note.title).trim()===title);return{type:"note",id:(exact||(same.length===1?same[0]:null))?.id||stableHash(`${title}|${body}`),title}}catch{return{type:"note",id:stableHash(`${title}|${body}`),title}}}

  function installLinkLabelPicker(){
    if(pathname!=="/links"||document.documentElement.dataset.noemaLinkLabelPicker==="1")return;
    const form=document.getElementById("addForm");const urlInput=document.getElementById("urlInput");const titleInput=document.getElementById("titleInput");const labelInput=document.getElementById("labelInput");const filterBar=document.getElementById("filterBar");
    if(!form||!urlInput||!titleInput||!labelInput||!filterBar)return;
    document.documentElement.dataset.noemaLinkLabelPicker="1";
    labelInput.placeholder="Nova labela (opciono)";
    const hint=document.createElement("div");hint.className="noema-link-label-hint";hint.textContent="Za postojeću labelu samo klikni jednu ispod dok dodaješ link.";form.insertAdjacentElement("afterend",hint);
    const hasDraft=()=>Boolean(urlInput.value.trim()||titleInput.value.trim()||labelInput.value.trim());
    const sync=()=>{const selected=labelInput.value.trim().toLowerCase();filterBar.querySelectorAll(".filter-pill[data-label]").forEach(button=>button.classList.toggle("noema-add-label-selected",Boolean(selected)&&String(button.dataset.label||"").toLowerCase()===selected))};
    labelInput.addEventListener("input",sync);
    filterBar.addEventListener("click",event=>{const button=event.target.closest(".filter-pill[data-label]");const label=String(button?.dataset.label||"").trim();if(!button||!label||!hasDraft())return;event.preventDefault();event.stopPropagation();labelInput.value=label;labelInput.dispatchEvent(new Event("input",{bubbles:true}));labelInput.focus({preventScroll:true})},true);
    new MutationObserver(sync).observe(filterBar,{childList:true,subtree:true});
    sync();
  }

  function scanSources(){
    if(pathname==="/documents"){const title=document.getElementById("detailTitle")?.textContent.trim();const copy=[...document.querySelectorAll("#detailCol button")].find(button=>button.textContent.trim().toLowerCase()==="copy");if(title&&copy){let button=document.getElementById("noema-document-task-button");if(!button){button=document.createElement("button");button.id="noema-document-task-button";button.className=`${copy.className} noema-task-toolbar`;copy.parentNode.insertBefore(button,copy)}const id=document.querySelector("#sidebarList .sidebar-item.active [data-del-id]")?.dataset.delId||stableHash(`${title}|${document.getElementById("docBody")?.innerText||""}`);bind(button,async()=>({type:"document",id,title}))}}
    else if(pathname==="/notes"){const toolbar=document.querySelector(".note-toolbar");if(toolbar){let button=document.getElementById("noema-note-task-button");if(!button){button=document.createElement("button");button.id="noema-note-task-button";button.className="note-action-btn noema-task-toolbar";toolbar.prepend(button)}bind(button,noteSource)}}
    else if(pathname==="/links")document.querySelectorAll("article.card[data-id]").forEach(card=>{const actions=card.querySelector(".card-foot");const title=text(card.querySelector(".title-text"),".edit-icon");addCardButton(actions,actions?.querySelector(".card-read"),"card-read noema-task-compact",async()=>({type:"link",id:card.dataset.id,title}),`link:${card.dataset.id}`)});
    else if(pathname==="/inspiration"||pathname==="/buildingsite")document.querySelectorAll("article.collection").forEach(card=>{const actions=card.querySelector(".collection-actions");const control=actions?.querySelector("[data-edit],[data-delete]");const id=control?.dataset.edit||control?.dataset.delete;const title=text(card.querySelector(".collection-title-link,h2"));const type=pathname==="/inspiration"?"inspiration":"building-site";if(id)addCardButton(actions,actions?.firstElementChild,"quiet-button noema-task-compact",async()=>({type,id,title}),`${type}:${id}`)});
    else if(pathname==="/ai-projects")document.querySelectorAll("article.project-card").forEach(card=>{const actions=card.querySelector(".card-actions");const id=actions?.querySelector("[data-pin]")?.dataset.pin;const title=text(card.querySelector(".card-title-link"));if(id)addCardButton(actions,actions.firstElementChild,"action-btn noema-task-compact",async()=>({type:"ai-project",id,title}),`ai-project:${id}`)});
    else if(pathname==="/files"){const id=new URLSearchParams(location.search).get("open");const title=document.getElementById("heading")?.textContent.trim();const toolbar=document.querySelector(".toolbar");if(id&&title&&toolbar)addCardButton(toolbar,toolbar.firstElementChild,"button noema-task-compact",async()=>({type:"file",id,title}),`file:${id}`)}
  }

  function decorate(element,task){const source=normalizeSource(task.source);if(!source)return;const config=SOURCE_CONFIG[source.type];element.classList.add("noema-source-linked",`noema-source-${config.className}`);element.dataset.noemaSourceHref=hrefOf(source);const title=element.querySelector(".task-title");if(!title||title.dataset.noemaSourceTask===task.id)return;title.replaceChildren();const link=document.createElement("a");link.className="noema-source-link";link.href=hrefOf(source);link.textContent=task.title;const badge=document.createElement("span");badge.className="noema-source-badge";badge.textContent=config.label;title.append(link,badge);title.dataset.noemaSourceTask=task.id}
  async function scanMain(){try{const tasks=await loadTasks();for(const task of tasks){const source=normalizeSource(task.source);if(source)linked[keyOf(source)]={taskId:task.id,title:task.title,createdAt:task.createdAt}}saveLinked();const byId=new Map(tasks.map(task=>[String(task.id),task]));document.querySelectorAll(".task[data-id]").forEach(element=>{const task=byId.get(String(element.dataset.id));if(task?.source)decorate(element,task)})}catch{}}

  function focusRequested(){const id=new URLSearchParams(location.search).get("open");if(!id)return;if(pathname==="/documents")document.querySelector(`#sidebarList [data-del-id="${CSS.escape(id)}"]`)?.closest(".sidebar-item")?.click();else if(pathname==="/links")document.querySelector(`article.card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});else if(pathname==="/ai-projects")document.querySelector(`[data-pin="${CSS.escape(id)}"]`)?.closest("article.project-card")?.scrollIntoView({behavior:"smooth",block:"center"})}
  function scan(){installStyles();installLinkLabelPicker();if(isMain)scanMain();else{scanSources();focusRequested()}}
  function schedule(){clearTimeout(timer);timer=setTimeout(scan,80)}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style"]});addEventListener("pageshow",schedule);addEventListener("storage",event=>{if(event.key===STORAGE_KEY){linked=loadLinked();schedule()}});schedule();
})();
