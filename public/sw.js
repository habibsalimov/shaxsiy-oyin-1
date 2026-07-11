/* Shaxsiy O'yin — Service Worker
 * Strategiya:
 *   - Socket.IO (/socket.io/) va API (/api/) — BUTUNLAY chetlab o'tiladi (real-time o'yin).
 *   - Navigatsiya (HTML) — network-first, oflaynda keshdagi ilova qobig'i.
 *   - Boshqa same-origin GET (JS/CSS/rasm/ovoz) — stale-while-revalidate.
 * Keshni yangilash uchun CACHE_VERSION ni oshiring.
 */
const CACHE_VERSION = "v1";
const CACHE_NAME = `shaxsiy-oyin-${CACHE_VERSION}`;

// O'rnatishda darhol keshlanadigan minimal qobiq.
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Klient sahifadan darhol yangilanish so'rovi (yangi SW faollashtirish).
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Faqat same-origin. Boshqa domenlarga (CDN shriftlar va h.k.) tegmaymiz.
  if (url.origin !== self.location.origin) return;

  // Real-time va API — hech qachon ushlamaymiz/keshlamaymiz.
  if (url.pathname.startsWith("/socket.io/") || url.pathname.startsWith("/api/")) return;

  // Faqat GET keshlanadi.
  if (request.method !== "GET") return;

  // Navigatsiya so'rovlari (SPA): network-first, oflaynda keshdagi qobiq.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/")))
    );
    return;
  }

  // Boshqa static resurslar: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
