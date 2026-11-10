"use client";

// Couche Leaflet de la carte sans réseau : dessine, sous le plan en ligne,
// les tuiles gardées sur le téléphone (lib/carte-hors-ligne.ts). Ajoutée
// seulement quand le réseau manque (LiveMap, PositionPicker) : avec du
// réseau, le plan habituel suffit et le téléphone ne dessine rien de plus.

import type * as Leaflet from "leaflet";
import { carteHorsLigneDisponible, CARTE_EVENT, lireTuileLocale } from "./carte-hors-ligne";
import { ZOOM_MAX_CARTE } from "./carte-plan";
import { COUCHES_UTILES, dessinerTuile } from "./carte-dessin";
import { lireTuile } from "./mvt";
import type { Couche } from "./mvt";

const ATTRIBUTION =
  'Carte sans réseau &copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>, Protomaps';

// Tuiles décodées récemment (le sur-zoom redessine souvent la même).
const MEMOIRE_MAX = 48;
let memoire = new Map<string, Promise<Couche[] | null>>();
if (typeof window !== "undefined") window.addEventListener(CARTE_EVENT, () => (memoire = new Map()));

function couchesDe(z: number, x: number, y: number): Promise<Couche[] | null> {
  const cle = `${z}/${x}/${y}`;
  let p = memoire.get(cle);
  if (p) {
    memoire.delete(cle);
    memoire.set(cle, p);
    return p;
  }
  p = lireTuileLocale(z, x, y)
    .then((o) => (o ? lireTuile(o, COUCHES_UTILES) : null))
    .catch(() => null);
  memoire.set(cle, p);
  if (memoire.size > MEMOIRE_MAX) memoire.delete(memoire.keys().next().value as string);
  return p;
}

async function dessiner(canvas: HTMLCanvasElement, z: number, x: number, y: number, densite: number): Promise<void> {
  // Au-delà du zoom 15 : un morceau de la tuile du zoom 15, agrandi.
  const dz = Math.max(0, z - ZOOM_MAX_CARTE);
  const echelle = 2 ** dz;
  const zd = z - dz;
  const xd = Math.floor(x / echelle);
  const yd = Math.floor(y / echelle);
  const couches = await couchesDe(zd, xd, yd);
  if (!couches) return; // pas gardée : la case reste transparente
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  dessinerTuile(ctx, couches, {
    taille: canvas.width,
    zoom: z,
    densite,
    echelle,
    dx: x - xd * echelle,
    dy: y - yd * echelle,
  });
}

/** Nouvelle couche (à ajouter sous le plan, `bringToBack`). */
export function creerCoucheHorsLigne(L: typeof Leaflet): Leaflet.GridLayer {
  const Couche = L.GridLayer.extend({
    createTile(coords: Leaflet.Coords, done: Leaflet.DoneCallback): HTMLElement {
      const canvas = document.createElement("canvas");
      const densite = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = 256 * densite;
      canvas.height = 256 * densite;
      dessiner(canvas, coords.z, coords.x, coords.y, densite).then(
        () => done(undefined, canvas),
        () => done(undefined, canvas),
      );
      return canvas;
    },
  });
  return new Couche({ attribution: ATTRIBUTION, maxZoom: 20, zIndex: 0, className: "couche-hors-ligne" }) as Leaflet.GridLayer;
}

/**
 * Branche la carte sans réseau sur une carte Leaflet : ajoutée dès que le
 * téléphone passe hors ligne, ou quand les tuiles du plan n'arrivent plus
 * (réseau saturé). Renvoie la fonction qui débranche tout.
 */
export function brancherCarteHorsLigne(L: typeof Leaflet, map: Leaflet.Map, plan: Leaflet.TileLayer | null): () => void {
  let couche: Leaflet.GridLayer | null = null;
  let erreurs: number[] = [];
  const activer = () => {
    if (couche || !carteHorsLigneDisponible()) return;
    couche = creerCoucheHorsLigne(L).addTo(map);
    couche.bringToBack();
  };
  const surErreur = () => {
    const maintenant = Date.now();
    erreurs = erreurs.filter((t) => maintenant - t < 20_000);
    erreurs.push(maintenant);
    if (erreurs.length >= 2 || !navigator.onLine) activer();
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) activer();
  window.addEventListener("offline", activer);
  plan?.on("tileerror", surErreur);
  return () => {
    window.removeEventListener("offline", activer);
    plan?.off("tileerror", surErreur);
    couche?.remove();
    couche = null;
  };
}
