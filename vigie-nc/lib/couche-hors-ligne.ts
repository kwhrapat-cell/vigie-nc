"use client";

// Couches Leaflet dessinées sur le téléphone (canvas), à partir de la carte
// vectorielle de la Calédonie (lib/carte-dessin.ts) :
//  - le fond « Vigie » (sombre ou clair) : tuile gardée sur le téléphone si
//    la carte sans réseau est téléchargée, sinon lue en ligne par blocs
//    (lib/carte-en-ligne.ts) ;
//  - la carte sans réseau sous les fonds OpenStreetMap / satellite :
//    ajoutée seulement quand le réseau manque (brancherCarteHorsLigne).

import type * as Leaflet from "leaflet";
import { carteHorsLigneDisponible, CARTE_EVENT, lireTuileLocale } from "./carte-hors-ligne";
import { lireTuileEnLigne } from "./carte-en-ligne";
import { ZOOM_MAX_CARTE } from "./carte-plan";
import { COUCHES_UTILES, dessinerTuile, PALETTES } from "./carte-dessin";
import type { NomPalette } from "./carte-dessin";
import { demoActive } from "./demo";
import { lireTuile } from "./mvt";
import type { Couche } from "./mvt";
import { famillePolice } from "./point-route-dessin";

const ATTRIBUTION_HORS_LIGNE =
  'Carte sans réseau &copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>, Protomaps';
const ATTRIBUTION_VIGIE =
  '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>';

/** D'où vient la tuile : le téléphone seulement, ou le téléphone puis la carte en ligne. */
type Source = "locale" | "vigie";

// Tuiles décodées récemment (le sur-zoom redessine souvent la même).
const MEMOIRE_MAX = 64;
let memoire = new Map<string, Promise<Couche[] | null>>();
if (typeof window !== "undefined") window.addEventListener(CARTE_EVENT, () => (memoire = new Map()));

/**
 * Couches de la tuile, ou null quand il n'y a rien à cet endroit (pas
 * gardée sur le téléphone ; ou, en ligne, la mer au large). Une panne de
 * réseau rejette la promesse (la tuile sera redemandée).
 */
function couchesDe(source: Source, z: number, x: number, y: number): Promise<Couche[] | null> {
  const cle = `${source}/${z}/${x}/${y}`;
  let p = memoire.get(cle);
  if (p) {
    memoire.delete(cle);
    memoire.set(cle, p);
    return p;
  }
  p = (async () => {
    const locale = demoActive() ? null : await lireTuileLocale(z, x, y).catch(() => null);
    if (locale) return lireTuile(locale, COUCHES_UTILES);
    if (source === "locale") return null;
    const enLigne = await lireTuileEnLigne(z, x, y);
    return enLigne ? lireTuile(enLigne, COUCHES_UTILES) : null;
  })();
  p.catch(() => memoire.delete(cle));
  memoire.set(cle, p);
  if (memoire.size > MEMOIRE_MAX) memoire.delete(memoire.keys().next().value as string);
  return p;
}

// File de dessin : une tuile à la fois, chacune dans sa propre tâche, pour
// que le téléphone reste réactif (glisser, toucher) pendant que la carte se
// dessine. Une tuile retirée entre-temps (zoom ou déplacement rapide) n'est
// pas dessinée du tout.
let file: Promise<void> = Promise.resolve();
const pause = () => new Promise<void>((r) => setTimeout(r, 0));
function aSonTour(travail: () => void): Promise<void> {
  const p = file.then(pause).then(travail);
  file = p.catch(() => undefined);
  return p;
}

async function dessiner(
  canvas: HTMLCanvasElement,
  c: { z: number; x: number; y: number },
  densite: number,
  source: Source,
  palette: NomPalette,
  police: string,
): Promise<void> {
  // Au-delà du zoom 15 : un morceau de la tuile du zoom 15, agrandi.
  const dz = Math.max(0, c.z - ZOOM_MAX_CARTE);
  const echelle = 2 ** dz;
  const zd = c.z - dz;
  const xd = Math.floor(c.x / echelle);
  const yd = Math.floor(c.y / echelle);
  const couches = await couchesDe(source, zd, xd, yd);
  await aSonTour(() => peindre(canvas, c, densite, source, palette, police, couches, { echelle, xd, yd }));
}

function peindre(
  canvas: HTMLCanvasElement,
  c: { z: number; x: number; y: number },
  densite: number,
  source: Source,
  palette: NomPalette,
  police: string,
  couches: Couche[] | null,
  { echelle, xd, yd }: { echelle: number; xd: number; yd: number },
): void {
  // Tuile déjà retirée de la carte : rien à dessiner.
  if (!canvas.isConnected) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (!couches) {
    // Hors ligne : la case reste transparente (le plan est dessous ou dessus).
    // En ligne : rien sur la carte à cet endroit = la mer.
    if (source === "vigie") {
      ctx.fillStyle = PALETTES[palette].mer;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }
  dessinerTuile(ctx, couches, {
    taille: canvas.width,
    zoom: c.z,
    densite,
    echelle,
    dx: c.x - xd * echelle,
    dy: c.y - yd * echelle,
    palette,
    police,
    x: c.x,
    y: c.y,
  });
}

function creerCouche(
  L: typeof Leaflet,
  source: Source,
  palette: NomPalette,
  options: Leaflet.GridLayerOptions,
): Leaflet.GridLayer {
  const police = `${famillePolice("--police-texte", '"Inter"')}, system-ui, sans-serif`;
  // Options données dans `extend` (Leaflet les fusionne avec celles de
  // GridLayer) : le constructeur créé n'accepte pas d'arguments pour TypeScript.
  const Classe = L.GridLayer.extend({
    options,
    createTile(coords: Leaflet.Coords, done: Leaflet.DoneCallback): HTMLElement {
      const canvas = document.createElement("canvas");
      const densite = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = 256 * densite;
      canvas.height = 256 * densite;
      dessiner(canvas, coords, densite, source, palette, police).then(
        () => done(undefined, canvas),
        (e: unknown) => done(e instanceof Error ? e : new Error("tuile"), canvas),
      );
      return canvas;
    },
  });
  return new Classe() as Leaflet.GridLayer;
}

/** Fond « Vigie » (sombre ou clair) : le téléphone d'abord, puis en ligne. */
export function creerCoucheVigie(L: typeof Leaflet, palette: NomPalette): Leaflet.GridLayer {
  return creerCouche(L, "vigie", palette, {
    attribution: ATTRIBUTION_VIGIE,
    maxZoom: 20,
    className: "couche-vigie",
  });
}

/** Carte sans réseau (à ajouter sous le plan, `bringToBack`). */
export function creerCoucheHorsLigne(L: typeof Leaflet): Leaflet.GridLayer {
  return creerCouche(L, "locale", "osm", {
    attribution: ATTRIBUTION_HORS_LIGNE,
    maxZoom: 20,
    zIndex: 0,
    className: "couche-hors-ligne",
  });
}

/**
 * Branche la carte sans réseau sur une carte Leaflet : ajoutée dès que le
 * téléphone passe hors ligne, ou quand les tuiles du plan n'arrivent plus
 * (réseau saturé). Renvoie la fonction qui débranche tout.
 */
export function brancherCarteHorsLigne(L: typeof Leaflet, map: Leaflet.Map, plan: Leaflet.Layer | null): () => void {
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
