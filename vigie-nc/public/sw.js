// Service worker de Vigie NC : notifications d'alerte + ouverture sans
// réseau (cyclone, réseau saturé).
//   - Pages : réseau d'abord (toujours la dernière version en ligne), copie
//     en cache seulement si le réseau ne répond pas.
//   - Fichiers de l'appli (/_next/static, icônes) : cache d'abord (leurs
//     noms changent à chaque version, une copie n'est jamais périmée).
//   - Fonds de carte OpenStreetMap : réseau d'abord (rien ne change en
//     ligne) ; copie des dernières tuiles vues pour les afficher sans réseau.
//   - Fond « Vigie » : blocs de 32 Ko du fichier de la carte (/api/carte,
//     lib/carte-blocs.ts). Un fichier daté ne change jamais : cache d'abord,
//     dans « carte-blocs-v1 » (nom sans « vigie- » : gardé d'une version du
//     site à l'autre), les MAX_BLOCS derniers. Les gros morceaux de la carte
//     sans réseau (jusqu'à 4 Mo) ne passent pas par là : l'appli les range
//     elle-même (lib/carte-hors-ligne.ts).
//   - Données (Supabase, /api) : jamais mises en cache ici ; la dernière
//     carte est gardée par l'appli (lib/useLiveReports.ts) avec son heure.
//   - Préparation (message « prechauffer » de components/ServiceWorkerRegister,
//     une fois par version du site et par jour au plus) : l'accueil, Signaler
//     et SOS sont copiés avec leurs fichiers, pour s'ouvrir sans réseau même
//     si on ne les a jamais ouverts (un signalement fait sans réseau est
//     gardé sur le téléphone : lib/en-attente.ts).

const VERSION = "v2";
const PAGES = `vigie-pages-${VERSION}`;
const STATIQUE = `vigie-statique-${VERSION}`;
const TUILES = `vigie-tuiles-${VERSION}`;
const MAX_STATIQUE = 200;
const MAX_TUILES = 300;
const BLOCS = "carte-blocs-v1";
const MAX_BLOCS = 300; // ≈ 10 Mo
const BLOC_MAX_OCTETS = 32768;
const A_PREPARER = ["/", "/signaler", "/sos"];
// Fichiers de l'appli cités dans une page (scripts, styles, polices).
const FICHIER_APPLI = /\/_next\/static\/[^"'\s<>\\)]+/g;

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
    return (
      (await cache.match(request)) ||
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match("/")) ||
      Response.error()
    );
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

/** Bloc du fond « Vigie » (pas un gros morceau de la carte sans réseau). */
function estBloc(url) {
  const f = url.searchParams.get("f");
  const debut = Number(url.searchParams.get("debut"));
  const fin = Number(url.searchParams.get("fin"));
  return Boolean(f) && Number.isInteger(debut) && Number.isInteger(fin) && fin >= debut && fin - debut + 1 <= BLOC_MAX_OCTETS;
}

async function preparer() {
  const pages = await caches.open(PAGES);
  const statique = await caches.open(STATIQUE);
  const fichiers = new Set();
  for (const chemin of A_PREPARER) {
    try {
      const response = await fetch(chemin, { credentials: "same-origin" });
      if (!response.ok) continue;
      const html = await response.clone().text();
      await pages.put(chemin, response);
      for (const m of html.matchAll(FICHIER_APPLI)) fichiers.add(m[0]);
    } catch {
      // pas de réseau : on réessaiera à la prochaine ouverture
    }
  }
  for (const fichier of fichiers) {
    try {
      if (await statique.match(fichier)) continue;
      const response = await fetch(fichier);
      if (response.ok) await statique.put(fichier, response);
    } catch {
      // un fichier manquant n'empêche pas les autres
    }
  }
  // Les fichiers préparés sont les plus récents : le tri garde ceux-là.
  await trim(STATIQUE, MAX_STATIQUE);
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "prechauffer") event.waitUntil(preparer());
});

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
    return;
  }
  if (url.origin === self.location.origin && url.pathname === "/api/carte" && estBloc(url)) {
    event.respondWith(cacheFirst(request, BLOCS, MAX_BLOCS));
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
  // Seulement une page de Vigie NC (revue de sécurité du 11/11/2026) : une
  // adresse d'un autre site dans une notification ouvre l'accueil à la place.
  let url = new URL("/", self.location.origin).href;
  try {
    const demandee = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (demandee.origin === self.location.origin) url = demandee.href;
  } catch {
    // adresse illisible : l'accueil
  }
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
