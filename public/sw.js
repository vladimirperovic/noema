const CACHE_NAME = "noema-v10-static-only";

// Only source-controlled, data-free shell assets may enter Cache Storage.
// Never add files, galleries, thumbnails, uploads, backups or API responses here.
const ASSETS = [
  "/index.html",
  "/404.html",
  "/ai-projects.html",
  "/archive.html",
  "/documents.html",
  "/invoices.html",
  "/help.html",
  "/links.html",
  "/notes.html",
  "/stats.html",
  "/stats-model.js",
  "/cmdk.js",
  "/noema-header-footer.js",
  "/source-task-buttons.js",
  "/source-task-navigation.js",
  "/favicon.svg",
  "/manifest.json",
];
const CACHEABLE_PATHS = new Set(ASSETS);

function isSensitivePath(pathname) {
  return pathname.startsWith("/api/")
    || pathname === "/files" || pathname === "/files.html" || pathname.startsWith("/files/")
    || pathname === "/backup" || pathname === "/backup.html" || pathname.startsWith("/backup/")
    || pathname === "/buildingsite" || pathname === "/buildingsite.html" || pathname.startsWith("/buildingsite/")
    || pathname === "/inspiration" || pathname === "/inspiration.html" || pathname.startsWith("/inspiration/")
    || pathname.startsWith("/buildingsite-files/")
    || pathname.startsWith("/inspiration-files/")
    || pathname.startsWith("/uploads/")
    || pathname.startsWith("/thumbnails/")
    || pathname.startsWith("/private-assets/")
    || pathname.startsWith("/gallery")
    || pathname.startsWith("/media/");
}

function requestMayBeCached(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin
    && url.search === ""
    && !isSensitivePath(url.pathname)
    && CACHEABLE_PATHS.has(url.pathname);
}

function responseMayBeCached(request, response) {
  if (!requestMayBeCached(request) || !response || response.status !== 200) return false;
  const cacheControl = String(response.headers.get("cache-control") || "").toLowerCase();
  return !cacheControl.includes("no-store") && !cacheControl.includes("private");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      ASSETS.map((asset) => cache.add(asset).catch(() => null)),
    )),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // The version bump deliberately deletes every historical runtime cache that
  // may have contained decrypted/private responses from older service workers.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (!requestMayBeCached(event.request)) {
    // Sensitive/private and non-shell requests are strictly network-only.
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (responseMayBeCached(event.request, response)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(event.request)) || Response.error();
      }),
  );
});
