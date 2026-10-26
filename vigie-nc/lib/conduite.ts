// Mode conduite : choisir les dangers confirmés DEVANT le conducteur et
// décider quand les annoncer à voix haute. Tout se calcule sur le
// téléphone : la position ne sert qu'à la même recherche que la carte.
//
// ⚠️ Même logique dans l'appli Android de test (android/…/Conduite.kt) :
// garder les deux alignées.

import { distanceM, type LatLng } from "./geo";
import { NOM_APPLI } from "./territoire";
import { ALERT_TYPES, type Report, type ReportType } from "./types";

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
// Les dangers déjà annoncés sont gardés ce temps après l'arrêt du mode
// conduite : l'arrêter puis le relancer en route ne fait pas tout répéter.
export const CONDUITE_MEMOIRE_MS = 30 * 60_000;
// Site seulement (pas dans Conduite.kt) : pendant la conduite, si l'on a
// déplacé la carte à la main, elle revient toute seule sur le conducteur
// après ce délai.
export const CONDUITE_RECENTRAGE_MS = 20_000;

// Point route (site seulement pour l'instant, pas dans Conduite.kt) : au
// démarrage et à la demande, ce qui est signalé sur les 10 km devant (tous
// les types, confirmés ou non), dit en une ou deux phrases — écrites par
// l'IA si elle est branchée (lib/ia.ts, /api/point-route), sinon par
// textePointRoute() ci-dessous. Ces événements sont aussi mis en évidence
// sur la carte pendant la conduite.
export const POINT_ROUTE_KM = 10;
// Événements envoyés au plus (les plus proches).
export const POINT_ROUTE_MAX = 10;
// Entre deux points route demandés au bouton.
export const POINT_ROUTE_INTERVALLE_MS = 60_000;
// Durée d'affichage du texte du point route dans le bandeau.
export const POINT_ROUTE_AFFICHAGE_MS = 45_000;
// Au démarrage, les annonces à la portée attendent le point route (qui les
// dit toutes d'un coup), ce temps au plus. Les dangers à 500 m ou moins
// sont annoncés tout de suite.
export const POINT_ROUTE_ATTENTE_MS = 30_000;

export function estPortee(v: unknown): v is PorteeKm {
  return (CONDUITE_PORTEES_KM as readonly unknown[]).includes(v);
}

/** Rayon de la recherche autour du conducteur pour cette portée. */
export function rayonRecherche(porteeKm: PorteeKm): number {
  return Math.min(20_000, porteeKm * 1000 + CONDUITE_MARGE_RECHERCHE_M);
}

/**
 * Rayon de la recherche sur le site : au moins les 10 km du point route,
 * quelle que soit la portée de la voix.
 */
export function rayonRechercheSite(porteeKm: PorteeKm): number {
  return Math.max(rayonRecherche(porteeKm), rayonRecherche(POINT_ROUTE_KM));
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
 * n'annonce pas « 5 km » si l'on découvre le danger à 400 m. Un danger
 * déjà annoncé à une portée plus grande (on a réduit la portée en route)
 * compte comme annoncé à la nouvelle portée.
 */
export function aAnnoncer(
  devant: DangerDevant[],
  deja: Map<string, number>,
  porteeKm: PorteeKm,
): DangerDevant[] {
  const liste = paliers(porteeKm);
  const plafond = liste[0];
  const out: DangerDevant[] = [];
  for (const d of devant) {
    const palier = palierPour(d.distanceM, liste);
    if (palier == null) continue;
    const precedent = deja.get(d.report.id);
    if (precedent != null && Math.min(precedent, plafond) <= palier) continue;
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
  travaux: "travaux",
  chaussee_degradee: "chaussée dégradée",
  autre: "signalement",
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

// ---------------------------------------------------------------------
// Point route : les 10 km devant (ou autour, à l'arrêt)
// ---------------------------------------------------------------------

/**
 * Tous les événements en cours (sauf SOS) sur les 10 km devant, confirmés
 * ou non, du plus proche au plus loin. Sans sens de marche (arrêt,
 * départ) : tout ce qui est à moins de 10 km, dans toutes les directions.
 */
export function evenementsDevant(
  position: LatLng,
  cap: number | null,
  reports: Report[],
  now = Date.now(),
): DangerDevant[] {
  const portee = POINT_ROUTE_KM * 1000;
  const out: DangerDevant[] = [];
  for (const r of reports) {
    if (r.type === "sos" || r.active === false) continue;
    if (new Date(r.expiresAt).getTime() <= now) continue;
    const d = distanceM(position, r);
    if (d > portee) continue;
    if (cap == null || d < 150 || ecartDeg(cap, capDeg(position, r)) <= CONDUITE_ANGLE_DEVANT_DEG) {
      out.push({ report: r, distanceM: d });
    }
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, POINT_ROUTE_MAX);
}

/** Confirmé par une 2e personne ou une source officielle. */
export function estConfirme(r: Report): boolean {
  return r.confirmations >= 1 || Boolean(r.officialSource);
}

const GRAVES: ReportType[] = ["route_coupee", "inondation", "accident", "feu", "danger", "meteo"];

// Événements nommés au plus dans le point route sans IA.
const POINT_ROUTE_NOMMES = 4;

function triPointRoute(liste: DangerDevant[]): DangerDevant[] {
  return [...liste].sort((a, b) => {
    const ga = GRAVES.includes(a.report.type) ? 0 : 1;
    const gb = GRAVES.includes(b.report.type) ? 0 : 1;
    return ga - gb || a.distanceM - b.distanceM;
  });
}

/** Les événements nommés par textePointRoute (les autres sont seulement comptés). */
export function citesPointRoute(liste: DangerDevant[]): DangerDevant[] {
  return triPointRoute(liste).slice(0, POINT_ROUTE_NOMMES);
}

/**
 * Point route sans IA (pas de réseau, IA pas branchée ou trop lente) :
 * « Sur les 10 prochains kilomètres : inondation à 2,3 kilomètres ;
 * travaux à 6 kilomètres, à confirmer. » Les dangers d'abord.
 */
export function textePointRoute(liste: DangerDevant[], avecCap: boolean): string {
  const debut = avecCap ? "Sur les 10 prochains kilomètres" : "À moins de 10 kilomètres";
  if (liste.length === 0) {
    return `Rien de signalé sur ${NOM_APPLI} ${
      avecCap ? "sur les 10 prochains kilomètres" : "à moins de 10 kilomètres"
    }. Reste prudent : tout n'est pas forcément signalé.`;
  }
  const tries = triPointRoute(liste);
  const dits = tries.slice(0, POINT_ROUTE_NOMMES).map((d) => {
    const nom = NOMS_PARLES[d.report.type] ?? "signalement";
    return `${nom} ${distanceParlee(d.distanceM)}${estConfirme(d.report) ? "" : ", à confirmer"}`;
  });
  const reste = tries.length - dits.length;
  const fin = reste > 0 ? ` ; et ${reste} autre${reste > 1 ? "s" : ""} signalement${reste > 1 ? "s" : ""}` : "";
  return `${debut} : ${dits.join(" ; ")}${fin}.`;
}
