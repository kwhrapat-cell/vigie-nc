// Service worker de Vigie NC.
//
// Rôle volontairement limité : afficher la page « Pas de réseau » (avec les
// numéros d'urgence) quand on ouvre l'appli sans connexion. Il NE met PAS
// l'appli ni les signalements en cache : ce qu'on voit doit toujours être
// frais. C'est aussi lui qui permettra plus tard les notifications.

const CACHE = "vigie-nc-hors-ligne-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Seulement l'ouverture d'une page ; tout le reste passe sans détour.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((page) => page || Response.error()),
    ),
  );
});
