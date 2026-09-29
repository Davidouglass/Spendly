/*
 * Spendly — minimal service worker
 * Caches the app shell so Spendly opens even with a flaky connection.
 * NOTE: this cannot run "in the background" while the browser/tab is fully
 * closed — service workers only run while a tab is open (or briefly after,
 * depending on the browser). There is no server, so nothing happens for the
 * user without them opening the app. Recurring transactions are instead
 * checked and created the moment the app is opened (see processRecurring()
 * in script.js).
 */

const CACHE_NAME = "spendly-cache-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for app shell, network-first fallback for everything else
// (e.g. the Chart.js CDN script), so the app still works offline once visited.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
