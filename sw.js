const CACHE_NAME = "expense-tracker-pwa-v2";
const APP_SHELL = [
  "./", // index.html
  "./dashboard.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/config.js",
  "./js/auth.js",
  "./js/toast.js",
  "./pwa-register.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  // Critical CDN assets for offline functionality
  "https://cdn.tailwindcss.com",
  "https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Service Worker: Caching App Shell");
      return cache.addAll(APP_SHELL);
    }).catch((err) => console.error("Failed to cache App Shell:", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("./dashboard.html"))
    );
    return;
  }

  event.respondWith(
    // Strategy: Cache first, then network.
    // This is good for static assets that don't change often.
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // If we got a response from the network, cache it for next time.
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return networkResponse;
      });
    })
  );
});
