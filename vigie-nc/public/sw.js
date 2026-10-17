// Service worker de Vigie NC : notifications d'alerte + ouverture sans
// réseau (cyclone, réseau saturé).
//   - Pages : réseau d'abord (toujours la dernière version en ligne), copie
//     en cache seulement si le réseau ne répond pas.
//   - Fichiers de l'appli (/_next/static, icônes) : cache d'abord (leurs
//     noms changent à chaque version, une copie n'est jamais périmée).
//   - Fonds de carte OpenStreetMap : réseau d'abord (rien ne change en
//     ligne) ; copie des dernières tuiles vues pour les afficher sans réseau.
//   - Données (Supabase, /api) : jamais mises en cache ici ; la dernière
//     carte est gardée par l'appli (lib/useLiveReports.ts) avec son heure.

const VERSION = "v2";
const PAGES = `vigie-pages-${VERSION}`;
const STATIQUE = `vigie-statique-${VERSION}`;
const TUILES = `vigie-tuiles-${VERSION}`;
const MAX_STATIQUE = 200;
const MAX_TUILES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll(["/"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIQUE, TUILES]);
      for (const key of await caches.keys()) {
        if (key.startsWith("vigie-") && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("/")) || Response.error();
  }
}

async function networkFirstTile(request) {
  const cache = await caches.open(TUILES);
  try {
    const response = await fetch(request);
    // Seulement les réponses lisibles (tuiles demandées en CORS, voir
    // lib/map-styles.ts) : les réponses « opaques » prendraient une place
    // énorme dans le stockage du téléphone.
    if (response.ok) {
      cache.put(request, response.clone()).then(() => trim(TUILES, MAX_TUILES));
    }
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cacheName, max);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
    event.respondWith(cacheFirst(request, STATIQUE, MAX_STATIQUE));
    return;
  }
  if (url.hostname === "tile.openstreetmap.org") {
    event.respondWith(networkFirstTile(request));
  }
  // Tout le reste (Supabase, /api, autres sites) : réseau normal.
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Vigie NC";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      lang: "fr",
      data: { url: data.url || "/" },
    }),
  );
});

// Toucher la notification ouvre (ou ramène) l'appli sur le signalement.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          try {
            await client.focus();
            if ("navigate" in client) await client.navigate(url);
            return;
          } catch {
            break; // fenêtre impossible à reprendre : on en ouvre une
          }
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
