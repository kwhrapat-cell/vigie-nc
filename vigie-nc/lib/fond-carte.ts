"use client";

// Pose le fond de carte choisi (lib/map-styles.ts) sur une carte Leaflet,
// avec ses secours. Utilisé par LiveMap, PositionPicker et TrajetApercu.
//  - Vigie (sombre / clair) : dessiné sur le téléphone ; s'il n'arrive pas
//    alors que le téléphone a du réseau (serveur en panne), on bascule sur
//    le plan habituel (assombri pour « Vigie »).
//  - Plan / satellite : images d'autres serveurs ; plan de secours si elles
//    n'arrivent plus, et carte sans réseau dessous quand le réseau manque.

import type * as Leaflet from "leaflet";
import { brancherCarteHorsLigne, creerCoucheVigie } from "./couche-hors-ligne";
import { demoActive } from "./demo";
import { BACKUP_PLAN_LAYER, MAP_STYLES, SECOURS_VIGIE } from "./map-styles";
import type { TileSpec } from "./map-styles";
import type { MapStyle } from "./preferences";

/** Erreurs de tuiles en 20 s avant de passer au secours. */
const ERREURS_AVANT_SECOURS = 8;

function surveillerErreurs(couche: Leaflet.Layer, basculer: () => void): () => void {
  let erreurs: number[] = [];
  const surErreur = () => {
    // Sans réseau, aucun secours n'arriverait non plus.
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const maintenant = Date.now();
    erreurs = erreurs.filter((t) => maintenant - t < 20_000);
    erreurs.push(maintenant);
    if (erreurs.length >= ERREURS_AVANT_SECOURS) basculer();
  };
  couche.on("tileerror", surErreur);
  return () => couche.off("tileerror", surErreur);
}

function image(L: typeof Leaflet, spec: TileSpec): Leaflet.TileLayer {
  return L.tileLayer(spec.url, spec.options);
}

/**
 * Pose le fond `style` sur `map` (et `data-fond` sur son conteneur, pour la
 * couleur de fond pendant le chargement). Renvoie la fonction qui l'enlève.
 */
export function poserFond(L: typeof Leaflet, map: Leaflet.Map, conteneur: HTMLElement | null, style: MapStyle): () => void {
  const def = MAP_STYLES[style];
  conteneur?.setAttribute("data-fond", style);
  const couches: Leaflet.Layer[] = [];
  const nettoyages: (() => void)[] = [];

  const remplacer = (ancienne: Leaflet.Layer, nouvelle: Leaflet.Layer) => {
    ancienne.remove();
    nouvelle.addTo(map);
    const i = couches.indexOf(ancienne);
    if (i >= 0) couches[i] = nouvelle;
  };

  if (def.vecteur) {
    const vigie = creerCoucheVigie(L, def.vecteur).addTo(map);
    couches.push(vigie);
    let bascule = false;
    nettoyages.push(
      surveillerErreurs(vigie, () => {
        if (bascule) return;
        bascule = true;
        remplacer(vigie, image(L, SECOURS_VIGIE));
      }),
    );
    // Le réseau revient : les cases restées vides sont redessinées.
    const enLigne = () => {
      if (!bascule) vigie.redraw();
    };
    window.addEventListener("online", enLigne);
    nettoyages.push(() => window.removeEventListener("online", enLigne));
  } else {
    const images = def.layers.map((spec) => image(L, spec).addTo(map));
    couches.push(...images);
    const principale = images[0] ?? null;
    // Carte téléchargée (Profil › Carte sans réseau) : dessinée sous le plan
    // dès que le réseau manque.
    if (!demoActive()) nettoyages.push(brancherCarteHorsLigne(L, map, principale));
    // Plan de secours : si les tuiles du plan n'arrivent plus alors que le
    // téléphone a du réseau (serveur bloqué ou saturé), on bascule.
    if (style === "plan" && principale) {
      let bascule = false;
      nettoyages.push(
        surveillerErreurs(principale, () => {
          if (bascule) return;
          bascule = true;
          remplacer(principale, image(L, BACKUP_PLAN_LAYER));
        }),
      );
    }
  }

  return () => {
    nettoyages.forEach((n) => n());
    couches.forEach((c) => c.remove());
  };
}
