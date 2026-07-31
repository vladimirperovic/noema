const CACHE_NAME = "noema-v8";
const ASSETS = [
  "/", "/index.html", "/404.html", "/ai-projects.html", "/archive.html", "/backup.html",
  "/buildingsite.html", "/buildingsite.js", "/documents.html", "/files.html", "/help.html",
  "/inspiration.html", "/links.html", "/notes.html", "/stats.html", "/stats-model.js",
  "/cmdk.js", "/noema-header-footer.js", "/source-task-buttons.js", "/source-task-navigation.js",
  "/favicon.svg", "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response?.status === 200) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || (event.request.headers.get("accept")?.includes("text/html") ? caches.match("/index.html") : undefined))));
});
