// ============================================================================
// SERVICE WORKER: Control de Taller — V&V Grafic (PWA)
// Versión: 20261021_02
// ============================================================================

const CACHE_NAME = "vvgrafic-taller-cache-v2";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/app.js",
  "./src/config/conexion.js",
  "./src/utils/smart_parser.js",
  "./src/assets/logo.js",
  "./src/styles/cobalt_enterprise.css",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Aviso en pre-caching de algunos assets:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // NO interceptar ni cachear llamadas en vivo a Supabase, Google Apps Script, Google Drive ni WebSockets
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("google.com") ||
    url.hostname.includes("googleapis.com") ||
    req.method !== "GET"
  ) {
    return;
  }

  // Network-First con fallback a Caché para assets estáticos
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, clone);
          });
        }
        return networkRes;
      })
      .catch(() => {
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
      })
  );
});
