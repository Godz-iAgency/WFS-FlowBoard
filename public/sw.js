const CACHE_NAME = "wfs-flowboard-shell-v2";
const APP_SHELL = ["/offline.html", "/manifest.webmanifest", "/icons/flowboard-192.png", "/icons/flowboard-512.png", "/icons/flowboard-maskable-512.png"];
const SAFE_PUBLIC_PATHS = ["/offline.html", "/manifest.webmanifest", "/icons/", "/brand/", "/reference/"];

function offlineResponse() {
  return new Response("FlowBoard is offline.", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => (await caches.match("/offline.html")) ?? offlineResponse()),
    );
    return;
  }

  const isSafePublicAsset = SAFE_PUBLIC_PATHS.some((path) => path.endsWith("/") ? url.pathname.startsWith(path) : url.pathname === path);
  if (!isSafePublicAsset) {
    event.respondWith(fetch(event.request).catch(() => offlineResponse()));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const refreshed = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached ?? offlineResponse());
      return cached ?? refreshed;
    }),
  );
});
