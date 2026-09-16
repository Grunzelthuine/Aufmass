// Service Worker für Material-Aufmaß App
// Versionsnummer bei jedem Deploy mit Inhaltsänderungen erhöhen, damit Nutzer die neue Version bekommen.
const CACHE_VERSION = "aufmass-v6";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./standardmaterial.json",
  "./vendor/jspdf.umd.min.js",
  "./vendor/jspdf.plugin.autotable.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
// Die "Aus Liste"-Materialdaten (materials-chunks/*, insgesamt ca. 100 MB)
// werden bewusst NICHT hier in CORE_ASSETS vorab beim Install geladen –
// das könnte die Installation auf einer langsamen/instabilen Verbindung
// zum Scheitern bringen. Stattdessen fragt app.js sie beim Start ganz normal
// per fetch() ab; der generische Cache-first-Handler unten cached sie dabei
// wie jede andere Datei auch, sodass sie ab dem zweiten Start aus dem Cache
// kommen (auch offline) und nicht erneut heruntergeladen werden müssen.

self.addEventListener("install", (event) => {
  // Bewusst KEIN self.skipWaiting() hier: eine neue Version soll erst
  // aktiv werden, wenn der Nutzer im Update-Banner "Jetzt aktualisieren"
  // klickt (siehe Message-Handler unten). Bei der allerersten Installation
  // gibt es ohnehin noch keine aktive Version, die warten müsste.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Wird von app.js aufgerufen, wenn der Nutzer im Update-Banner bestätigt.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Cache-first, damit die App auf der Baustelle auch ohne Netz zuverlässig läuft.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
