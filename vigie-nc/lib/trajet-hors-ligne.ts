// Dernier point sur le trajet favori, gardé sur le téléphone pour
// l'affichage sans réseau (components/TrajetResume.tsx) : les
// signalements de la route à cette heure-là et la mémoire des endroits
// déjà inondés (elle ne change presque pas d'un jour à l'autre).
//
// Règle « jamais de route libre » : sans réseau, on ne dit jamais « Rien
// de signalé » d'après une vieille copie, et rien n'est dit « en ce
// moment » (inondé en ce moment, pluie en cours) : on ne le sait plus.

import type { TrajetSignalement } from "./reports-api";
import type { MemoireInondations, Point } from "./trajet";

export const TRAJET_DERNIER_CLE = "vigie-nc:trajet-dernier-point";
export const TRAJET_DERNIER_MAX_MS = 12 * 3_600_000;

export interface DernierPointTrajet {
  /** Empreinte du trajet (un autre trajet n'utilise pas cette copie). */
  cle: string;
  /** Heure du dernier point réussi (ms). */
  at: number;
  liste: TrajetSignalement[];
  memoire: MemoireInondations | null;
}

/** Empreinte courte d'une ligne (nombre de points, début, milieu, fin). */
export function cleTrajet(points: Point[]): string {
  if (points.length === 0) return "vide";
  const p = (x: Point) => `${x[0].toFixed(4)},${x[1].toFixed(4)}`;
  return [points.length, p(points[0]), p(points[Math.floor(points.length / 2)]), p(points[points.length - 1])].join("|");
}

/**
 * Copie utilisable sans réseau : même trajet, moins de 12 h, sans les
 * signalements expirés depuis, et sans ce qui disait « en ce moment ».
 */
export function dernierPointUtilisable(brut: unknown, cle: string, maintenant: number): DernierPointTrajet | null {
  if (!brut || typeof brut !== "object") return null;
  const d = brut as Partial<DernierPointTrajet>;
  if (d.cle !== cle || typeof d.at !== "number" || !Array.isArray(d.liste)) return null;
  if (maintenant - d.at > TRAJET_DERNIER_MAX_MS || d.at > maintenant + 60_000) return null;
  const liste = d.liste.filter(
    (x) => x && x.report && typeof x.report.expiresAt === "string" && new Date(x.report.expiresAt).getTime() > maintenant,
  );
  const memoire =
    d.memoire && Array.isArray(d.memoire.zones)
      ? { pluieEnCours: false, zones: d.memoire.zones.map((z) => ({ ...z, enCours: false })) }
      : null;
  return { cle, at: d.at, liste, memoire };
}

export function lireDernierPoint(cle: string, maintenant: number = Date.now()): DernierPointTrajet | null {
  try {
    const raw = window.localStorage.getItem(TRAJET_DERNIER_CLE);
    return raw ? dernierPointUtilisable(JSON.parse(raw), cle, maintenant) : null;
  } catch {
    return null;
  }
}

/** Garde le dernier point réussi (la mémoire précédente si elle n'a pas pu être relue). */
export function garderDernierPoint(
  cle: string,
  liste: TrajetSignalement[],
  memoire: MemoireInondations | null,
): void {
  try {
    let memoireGardee = memoire;
    if (!memoireGardee) {
      const raw = window.localStorage.getItem(TRAJET_DERNIER_CLE);
      const avant = raw ? (JSON.parse(raw) as Partial<DernierPointTrajet>) : null;
      if (avant && avant.cle === cle && avant.memoire) memoireGardee = avant.memoire;
    }
    const valeur: DernierPointTrajet = { cle, at: Date.now(), liste, memoire: memoireGardee };
    window.localStorage.setItem(TRAJET_DERNIER_CLE, JSON.stringify(valeur));
  } catch {
    // stockage plein ou indisponible : sans conséquence
  }
}
