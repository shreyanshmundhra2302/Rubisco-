/**
 * RUBISCO — SERVICE WORKER
 * ----------------------------------
 * Caches the application shell so the app can LAUNCH offline and open
 * previously-saved (IndexedDB) projects without a network connection.
 *
 * Does NOT cache:
 *  - /api/* requests (AI generation, transform, PDF extraction) — these
 *    require a live network by design.
 *  - Any personal project data — that lives in IndexedDB, not the cache.
 */

const CACHE_NAME = "rubisco-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/style.css",
  "/js/db.js",
  "/js/api.js",
  "/js/ocr.js",
  "/js/blocks.js",
  "/js/editor.js",
  "/js/newproject.js",
  "/js/export.js",
  "/js/app.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls — they must hit the network or fail explicitly
  // so the app can show "AI features require an internet connection."
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // App shell: cache-first, fall back to network, update cache in background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && event.request.method === "GET") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
