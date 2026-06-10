const CACHE_NAME = "flim-shell-v3";
const SHELL_ASSETS = ["/", "/manifest.json", "/favicon.png", "/brand/flim-icon-192.png", "/brand/flim-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
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

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Flim";
  const body = payload.body || "You have a new Flim alert.";
  const url = payload.url || "/upcoming";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/brand/flim-icon-192.png",
      badge: "/brand/flim-icon-192.png",
      tag: payload.notificationId || url,
      data: {
        url,
        deliveryLogId: payload.deliveryLogId || "",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/upcoming";
  const deliveryLogId = event.notification.data?.deliveryLogId || "";

  event.waitUntil(
    Promise.all([
      deliveryLogId
        ? fetch("/api/push/opened", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deliveryLogId }),
          }).catch(() => undefined)
        : Promise.resolve(),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          for (const client of clients) {
            if ("focus" in client) {
              client.navigate(url);
              return client.focus();
            }
          }
          if (self.clients.openWindow) return self.clients.openWindow(url);
          return undefined;
        }),
    ]),
  );
});
