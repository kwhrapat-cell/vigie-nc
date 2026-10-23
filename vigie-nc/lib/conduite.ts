// Mode conduite : choisir les dangers confirmés DEVANT le conducteur et
// décider quand les annoncer à voix haute. Tout se calcule sur le
// téléphone : la position ne sert qu'à la même recherche que la carte.
//
// ⚠️ Même logique dans l'appli Android de test (android/…/Conduite.kt) :
// garder les deux alignées.

import { distanceM, LatLng } from "./geo";
import { ALERT_TYPES, Report, ReportType } from "./types";

// Portée de la voix, au choix : jusqu'où devant on annonce les dangers.
export const CONDUITE_PORTEES_KM = [3, 5, 10] as const;
export type PorteeKm = (typeof CONDUITE_PORTEES_KM)[number];
export const CONDUITE_PORTEE_DEFAUT_KM: PorteeKm = 5;
// Marge de recherche au-delà de la portée (on avance entre deux recherches).
// La base plafonne la recherche à 20 km.
export const CONDUITE_MARGE_RECHERCHE_M = 3_000;
// Nouvelle recherche après ce déplacement, ou ce délai.
export const CONDUITE_RELANCE_M = 1_500;
export const CONDUITE_RELANCE_MS = 90_000;
// Un danger est « devant » s'il est dans cet angle de part et d'autre du
// sens de marche (les routes tournent : pas trop étroit).
export const CONDUITE_ANGLE_DEVANT_DEG = 40;
// Rappel à l'approche, quelle que soit la portée.
export const CONDUITE_RAPPEL_M = 500;
// Sans sens de marche connu (arrêt, départ), on n'annonce que tout près.
export const CONDUITE_PORTEE_SANS_CAP_M = 1_000;
// En dessous de cette vitesse (m/s, ~9 km/h), le cap du GPS n'est pas fiable.
export const CONDUITE_VITESSE_CAP_MIN = 2.5;
// Déplacement minimal pour calculer soi-même le sens de marche.
export const CONDUITE_DEPLACEMENT_CAP_M = 30;
// Site seulement (pas dans Conduite.kt) : pendant la conduite, si l'on a
// déplacé la carte à la main, elle revient toute seule sur le conducteur
// après ce délai.
export const CONDUITE_RECENTRAGE_MS = 20_000;

export function estPortee(v: unknown): v is PorteeKm {
  return (CONDUITE_PORTEES_KM as readonly unknown[]).includes(v);
}

/** Rayon de la recherche autour du conducteur pour cette portée. */
export function rayonRecherche(porteeKm: PorteeKm): number {
  return Math.min(20_000, porteeKm * 1000 + CONDUITE_MARGE_RECHERCHE_M);
}

/**
 * Paliers d'annonce : une première fois à la portée choisie (ou dès qu'on
 * découvre le danger plus près), un rappel à 3 km si la portée est de
 * 10 km, puis une dernière fois à 500 m.
 */
export function paliers(porteeKm: PorteeKm): number[] {
  const p = porteeKm * 1000;
  return p >= 10_000 ? [p, 3_000, CONDUITE_RAPPEL_M] : [p, CONDUITE_RAPPEL_M];
}

/** Cap de a vers b, en degrés (0 = nord, 90 = est). */
export function capDeg(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Écart entre deux caps, de 0 à 180°. */
export function ecartDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Danger annoncé : même règle que les notifications (vigie_signal_notification
 * dans schema.sql) : type danger, et confirmé par une 2e personne ou une
 * source officielle. Le trafic dense s'ajoute seulement si on l'a choisi.
 */
export function estAnnoncable(r: Report, avecTrafic: boolean, now = Date.now()): boolean {
  const typeOk = ALERT_TYPES.includes(r.type) || (avecTrafic && r.type === "trafic_dense");
  if (!typeOk || r.active === false) return false;
  if (new Date(r.expiresAt).getTime() <= now) return false;
  return r.confirmations >= 1 || Boolean(r.officialSource);
}

export interface DangerDevant {
  report: Report;
  distanceM: number;
}

/**
 * Les dangers annonçables devant soi, du plus proche au plus loin.
 * `cap` = sens de marche en degrés, ou null s'il est inconnu (on ne garde
 * alors que ce qui est tout près, dans toutes les directions).
 */
export function dangersDevant(
  position: LatLng,
  cap: number | null,
  reports: Report[],
  avecTrafic: boolean,
  porteeKm: PorteeKm,
  now = Date.now(),
): DangerDevant[] {
  const portee = porteeKm * 1000;
  const out: DangerDevant[] = [];
  for (const r of reports) {
    if (!estAnnoncable(r, avecTrafic, now)) continue;
    const d = distanceM(position, r);
    if (cap == null) {
      if (d <= CONDUITE_PORTEE_SANS_CAP_M) out.push({ report: r, distanceM: d });
      continue;
    }
    if (d > portee) continue;
    // Tout près (< 150 m), on y est : l'angle ne veut plus rien dire.
    if (d < 150 || ecartDeg(cap, capDeg(position, r)) <= CONDUITE_ANGLE_DEVANT_DEG) {
      out.push({ report: r, distanceM: d });
    }
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

/** Plus petit palier atteint pour cette distance, ou null si trop loin. */
export function palierPour(distance: number, liste: number[]): number | null {
  let palier: number | null = null;
  for (const p of liste) {
    if (distance <= p && (palier == null || p < palier)) palier = p;
  }
  return palier;
}

/**
 * Les dangers à annoncer maintenant. `deja` retient, par signalement, le
 * plus petit palier déjà annoncé : on ne répète jamais un palier, et on
 * n'annonce pas « 5 km » si l'on découvre le danger à 400 m.
 */
export function aAnnoncer(
  devant: DangerDevant[],
  deja: Map<string, number>,
  porteeKm: PorteeKm,
): DangerDevant[] {
  const liste = paliers(porteeKm);
  const out: DangerDevant[] = [];
  for (const d of devant) {
    const palier = palierPour(d.distanceM, liste);
    if (palier == null) continue;
    const precedent = deja.get(d.report.id);
    if (precedent != null && precedent <= palier) continue;
    deja.set(d.report.id, palier);
    out.push(d);
  }
  return out;
}

const NOMS_PARLES: Partial<Record<ReportType, string>> = {
  accident: "accident",
  inondation: "inondation",
  feu: "feu ou fumée",
  route_coupee: "route coupée",
  danger: "danger",
  meteo: "météo dangereuse",
  trafic_dense: "trafic dense",
};

/** « à 2,8 kilomètres », « à 500 mètres » : écrit pour être lu à voix haute. */
export function distanceParlee(m: number): string {
  if (m < 1000) {
    const arrondi = Math.max(100, Math.round(m / 100) * 100);
    return arrondi >= 1000 ? "à 1 kilomètre" : `à ${arrondi} mètres`;
  }
  const km = Math.round(m / 100) / 10;
  if (km >= 10) return `à ${Math.round(km)} kilomètres`;
  return `à ${String(km).replace(".", ",")} kilomètre${km >= 2 ? "s" : ""}`;
}

/** Phrase de l'annonce : « Attention, route coupée à 2,8 kilomètres devant. » */
export function texteAnnonce(d: DangerDevant, avecCap: boolean): string {
  const nom = NOMS_PARLES[d.report.type] ?? "danger";
  return `Attention, ${nom} ${distanceParlee(d.distanceM)}${avecCap ? " devant" : ""}.`;
}
