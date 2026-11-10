// Annonces d'une commune (décision de Patrice du 10/11/2026) : une annonce
// publiée par l'agent d'une commune porte le périmètre de la commune
// (« zone » : centre + rayon). Le téléphone trie LUI-MÊME avec sa position
// ou « Ma zone » : rien de plus n'est envoyé à la base. Logique pure,
// testée par tests/annonces-zone.test.ts.

import { distanceM, type LatLng } from "./geo";
import type { Annonce, Perimetre } from "./types";

/** Le point est-il dans le périmètre ? (même règle que vigie_dans_perimetre du SQL) */
export function dansPerimetre(p: Perimetre, point: LatLng): boolean {
  return distanceM({ lat: p.lat, lng: p.lng }, point) <= p.rayonM;
}

/**
 * Annonces à montrer sur ce téléphone :
 * - toute la Calédonie : toujours ;
 * - une commune : seulement si `centre` (position, sinon « Ma zone ») est
 *   dans son périmètre. Sans centre connu : pas d'annonce de commune ;
 * - `garder` : l'annonce ouverte depuis une notification reste visible,
 *   même si on est sorti du périmètre depuis.
 */
export function annoncesPourMoi(annonces: Annonce[], centre: LatLng | null, garder?: string | null): Annonce[] {
  return annonces.filter((a) => {
    if (!a.zone) return true;
    if (garder && a.id === garder) return true;
    return centre !== null && dansPerimetre(a.zone, centre);
  });
}

/** « Toute la NC » ou le nom de la commune (« Ville du Mont-Dore »). */
export function libelleZone(a: Pick<Annonce, "zone">): string {
  return a.zone ? a.zone.nom : "Toute la NC";
}

/** Pour les lecteurs d'écran : « pour toute la Calédonie » ou « pour Ville du Mont-Dore ». */
export function destinataires(a: Pick<Annonce, "zone">): string {
  return a.zone ? `pour ${a.zone.nom}` : "pour toute la Calédonie";
}

/** « 12 km autour du centre » */
export function textePerimetre(p: Perimetre): string {
  const km = p.rayonM / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1).replace(".", ",")} km autour du centre`;
}
