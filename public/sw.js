const CACHE_NAME = "noema-v9";

// Cache only the explicit application shell. Private/API/media responses must
// never enter browser Cache Storage because they can contain decrypted user data.
const ASSETS = [
  "/", "/index.html", "/404.html", "/ai-projects.html", "/archive.html", "/backup.html",
  "/buildingsite.html", "/buildingsite.js", "/documents.html", "/files.html", "/help.html",
  "/inspiration.html", "/links.html", "/notes.html", "/stats.html", "/stats-model.js",
  "/cmdk.js", "/noema-header-footer.js", "/source-task-buttons.js", "/source-task-navigation.js",
  "/favicon.svg", "/manifest.json"
];
const CACHEABLE_PATHS = new Set(ASSETS);

function responseMayBeCached(request, response) {
  if (!response || response.status !== 200) return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !CACHEABLE_PATHS.has(url.pathname)) return false;
  const cacheControl = String(response.headers.get("cache-control") || "").toLowerCase();
  return !cacheControl.includes("no-store") && !cacheControl.includes("private");
}

async function cacheIfAllowed(request, response) {
  if (!responseMayBeCached(request, response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Bumping CACHE_NAME purges any older cache that may contain private responses.
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Cross-origin requests and every same-origin URL outside the shell allowlist
  // are network-only. This includes /api, uploads, files, galleries, thumbnails,
  // backups and every other user-data endpoint.
  if (url.origin !== self.location.origin || !CACHEABLE_PATHS.has(url.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        await cacheIfAllowed(event.request, response);
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || Response.error();
      })
  );
});
