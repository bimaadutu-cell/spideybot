const VERSION = "creepy-house-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/creepy.svg",
  "./icons/creepy-icon.jpg",
  "./images/creepy-house-menu.jpg",
  "./images/creepy-loading.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(VERSION).then((cache) => cache.put(new URL("./", self.registration.scope), copy)));
        }
        return response;
      }).catch(async () => {
        const cache = await caches.open(VERSION);
        return (await cache.match(new URL("./", self.registration.scope))) ||
          (await cache.match(new URL("./index.html", self.registration.scope))) ||
          new Response("CREEPY is offline. Reconnect and retry.", { status: 503 });
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)));
      }
      return response;
    })),
  );
});