// Trajet favori (maison → travail…) : préparation de la ligne envoyée à la
// base, point sur le trajet à l'ouverture, textes des alertes, mémoire sur
// le téléphone. Logique pure (testée par tests/trajet.test.ts) : pas
// d'import du navigateur ni de bibliothèque.
//
// Vie privée : le départ et l'arrivée exacts restent sur le téléphone. Le
// calcul d'itinéraire reçoit des positions arrondies à ~100 m
// (TRAJET_ARRONDI_DECIMALES) ; la base ne reçoit que la ligne sans ses
// 500 premiers et derniers mètres (TRAJET_COUPE_M).

import { distanceM } from "./geo";
import { ALERT_TYPES, REPORT_TYPE_LABELS } from "./types";
import type { LatLng } from "./geo";
import type { Report, ReportType } from "./types";

/** [lat, lng] — même ordre que Leaflet. */
export type Point = [number, number];

// ⚠️ Alignés sur supabase/schema.sql (section « Trajet favori »)
/** Couloir surveillé de chaque côté de la ligne (vigie_trajet_couloir_m). */
export const TRAJET_COULOIR_M = 300;
/** Point « avant départ » tant de minutes avant (vigie_trajet_avance_min). */
export const TRAJET_AVANCE_MIN = 30;
/** Alertes du trajet jusqu'à tant de minutes après le départ (vigie_trajet_apres_min). */
export const TRAJET_APRES_MIN = 60;
/** Nombre de points accepté par la base : 500 (vigie_trajet_ligne) ; on garde de la marge. */
export const TRAJET_POINTS_MAX = 400;
/** Longueur de la ligne acceptée par la base (vigie_trajet_ligne). */
export const TRAJET_LONGUEUR_MIN_M = 100;
export const TRAJET_LONGUEUR_MAX_M = 450_000;

/** Extrémités gardées sur le téléphone (maison, travail). */
export const TRAJET_COUPE_M = 500;
/** Départ et arrivée envoyés au calcul d'itinéraire : 3 décimales ≈ 100 m. */
export const TRAJET_ARRONDI_DECIMALES = 3;
/** Distance minimale entre départ et arrivée (à vol d'oiseau). */
export const TRAJET_DISTANCE_MIN_M = 500;

/** Jours : bit 0 = lundi … bit 6 = dimanche (comme la base). */
export const JOURS_SEMAINE = 0b0011111;
export const JOURS_TOUS = 0b1111111;
export const JOURS_INITIALES = ["L", "M", "M", "J", "V", "S", "D"] as const;
export const JOURS_NOMS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;
const JOURS_COURTS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;

/** Même emprise que vigie_dans_nc() de la base. */
export function dansNc(p: LatLng): boolean {
  return p.lat >= -23.2 && p.lat <= -19.0 && p.lng >= 163.0 && p.lng <= 168.6;
}

function arrondi(x: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(x * f) / f;
}

/** Position arrondie (envoyée au calcul d'itinéraire). */
export function arrondirPosition(p: LatLng, decimales = TRAJET_ARRONDI_DECIMALES): LatLng {
  return { lat: arrondi(p.lat, decimales), lng: arrondi(p.lng, decimales) };
}

const versPoint = (p: Point): LatLng => ({ lat: p[0], lng: p[1] });

export function longueurLigne(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(versPoint(points[i - 1]), versPoint(points[i]));
  return total;
}

/** Point à `d` mètres du début de la ligne (le dernier point si d dépasse). */
function interpoler(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Morceau de la ligne entre `debut` et `fin` mètres depuis son début. */
export function sousLigne(points: Point[], debut: number, fin: number): Point[] {
  if (points.length < 2 || fin <= debut) return [];
  const out: Point[] = [];
  let cumul = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const l = distanceM(versPoint(a), versPoint(b));
    const finSegment = cumul + l;
    if (finSegment >= debut && cumul <= fin && l > 0) {
      if (out.length === 0) out.push(debut <= cumul ? a : interpoler(a, b, (debut - cumul) / l));
      if (fin < finSegment) {
        out.push(interpoler(a, b, (fin - cumul) / l));
        break;
      }
      out.push(b);
    }
    cumul = finSegment;
  }
  return out;
}

/**
 * Retire les extrémités de la ligne (maison, travail) : `coupeM` de chaque
 * côté, ou 20 % de la longueur au plus pour un trajet court.
 */
export function couperExtremites(points: Point[], coupeM = TRAJET_COUPE_M): { points: Point[]; coupeM: number } {
  const l = longueurLigne(points);
  const coupe = Math.min(coupeM, l * 0.2);
  return { points: sousLigne(points, coupe, l - coupe), coupeM: coupe };
}

/** Coordonnées locales en mètres autour d'une latitude (assez précis sur quelques centaines de km). */
function projeteur(lat0: number) {
  const r = 6_371_008.8;
  const k = Math.PI / 180;
  const cos0 = Math.cos(lat0 * k);
  return (p: Point): [number, number] => [p[1] * k * r * cos0, p[0] * k * r];
}

/** Distance d'un point à un segment, en mètres, avec la part du segment parcourue (0 à 1). */
function versSegment(p: [number, number], a: [number, number], b: [number, number]): { d: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return { d: Math.sqrt(x * x + y * y), t };
}

/** Simplification (Douglas-Peucker) : retire les points à moins de `toleranceM` de la ligne. */
export function simplifier(points: Point[], toleranceM: number): Point[] {
  if (points.length <= 2) return points.slice();
  const proj = projeteur(points[0][0]);
  const xy = points.map(proj);
  const garde = new Uint8Array(points.length);
  garde[0] = 1;
  garde[points.length - 1] = 1;
  const pile: [number, number][] = [[0, points.length - 1]];
  while (pile.length > 0) {
    const [i, j] = pile.pop() as [number, number];
    let max = -1;
    let k = -1;
    for (let m = i + 1; m < j; m++) {
      const { d } = versSegment(xy[m], xy[i], xy[j]);
      if (d > max) {
        max = d;
        k = m;
      }
    }
    if (k !== -1 && max > toleranceM) {
      garde[k] = 1;
      pile.push([i, k], [k, j]);
    }
  }
  return points.filter((_, i) => garde[i] === 1);
}

/** Simplifie jusqu'à tenir en `max` points. */
export function limiterPoints(points: Point[], max = TRAJET_POINTS_MAX, toleranceM = 15): Point[] {
  let tol = toleranceM;
  let out = simplifier(points, tol);
  while (out.length > max) {
    tol *= 1.6;
    out = simplifier(points, tol);
  }
  return out;
}

/**
 * Ligne gardée et envoyée à la base : sans les extrémités, simplifiée,
 * coordonnées à 5 décimales (~1 m).
 */
export function preparerLigne(itineraire: Point[]): { points: Point[]; longueurM: number; coupeM: number } {
  const coupe = couperExtremites(itineraire);
  const points = limiterPoints(coupe.points).map((p) => [arrondi(p[0], 5), arrondi(p[1], 5)] as Point);
  return { points, longueurM: Math.round(longueurLigne(points)), coupeM: Math.round(coupe.coupeM) };
}

/** Distance d'un point à la ligne et sa place le long de la ligne (mètres depuis le début). */
export function positionSurLigne(p: LatLng, points: Point[]): { distanceM: number; positionM: number } {
  if (points.length === 0) return { distanceM: Infinity, positionM: 0 };
  if (points.length === 1) return { distanceM: distanceM(p, versPoint(points[0])), positionM: 0 };
  const proj = projeteur(p.lat);
  const xy = proj([p.lat, p.lng]);
  let meilleure = { distanceM: Infinity, positionM: 0 };
  let cumul = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const l = distanceM(versPoint(a), versPoint(b));
    const { d, t } = versSegment(xy, proj(a), proj(b));
    if (d < meilleure.distanceM) meilleure = { distanceM: d, positionM: cumul + t * l };
    cumul += l;
  }
  return meilleure;
}

// ---------------------------------------------------------------------
// Point sur le trajet (accueil)
// ---------------------------------------------------------------------

/** Même règle que les alertes : 2e personne ou source officielle. */
export function estConfirme(r: Pick<Report, "confirmations" | "officialSource">): boolean {
  return r.confirmations >= 1 || Boolean(r.officialSource);
}

export type NiveauTrajet = "calme" | "surveiller" | "danger";

export interface VerdictTrajet<R> {
  niveau: NiveauTrajet;
  /** Dangers confirmés (ceux qui déclenchent les alertes). */
  dangers: R[];
  /** Le reste : dangers pas encore confirmés, travaux, trafic, chaussée… */
  aSurveiller: R[];
}

type PourVerdict = Pick<Report, "type" | "confirmations" | "officialSource" | "active">;

export function verdictTrajet<R extends PourVerdict>(reports: R[]): VerdictTrajet<R> {
  const actifs = reports.filter((r) => r.type !== "sos" && r.active !== false);
  const dangers = actifs.filter((r) => ALERT_TYPES.includes(r.type) && estConfirme(r));
  const aSurveiller = actifs.filter((r) => !dangers.includes(r));
  return {
    niveau: dangers.length > 0 ? "danger" : aSurveiller.length > 0 ? "surveiller" : "calme",
    dangers,
    aSurveiller,
  };
}

/** Texte court de la pastille : « Rien de signalé », « 2 dangers », « 1 à surveiller ». */
export function texteVerdict(v: VerdictTrajet<unknown>): string {
  if (v.niveau === "calme") return "Rien de signalé";
  if (v.niveau === "surveiller") return `${v.aSurveiller.length} à surveiller`;
  const n = v.dangers.length;
  return `${n} danger${n > 1 ? "s" : ""}`;
}

// ---------------------------------------------------------------------
// Jours, heures, distances
// ---------------------------------------------------------------------

export function jourCoche(jours: number, i: number): boolean {
  return ((jours >> i) & 1) === 1;
}

export function basculerJour(jours: number, i: number): number {
  return jours ^ (1 << i);
}

/** « du lundi au vendredi », « tous les jours », « le week-end », « lun, mer, ven » */
export function joursTexte(jours: number): string {
  const j = jours & JOURS_TOUS;
  if (j === JOURS_TOUS) return "tous les jours";
  if (j === 0) return "aucun jour";
  if (j === 0b1100000) return "le week-end";
  const idx = [0, 1, 2, 3, 4, 5, 6].filter((i) => jourCoche(j, i));
  if (idx.length === 1) return `le ${JOURS_NOMS[idx[0]]}`;
  const suite = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
  if (suite && idx.length >= 3) return `du ${JOURS_NOMS[idx[0]]} au ${JOURS_NOMS[idx[idx.length - 1]]}`;
  return idx.map((i) => JOURS_COURTS[i]).join(", ");
}

/** « HH:MM » valide (00:00 à 23:59), comme vigie_trajet_heure(). */
export function heureValide(h: string | null | undefined): h is string {
  return typeof h === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(h);
}

/** « 06:30 » → « 6 h 30 », « 07:00 » → « 7 h » */
export function heureTexte(h: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(h);
  if (!m) return h;
  const heures = Number(m[1]);
  return m[2] === "00" ? `${heures} h` : `${heures} h ${m[2]}`;
}

/** « à 5 km du départ », « à moins d'1 km du départ » */
export function depuisDepartTexte(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  if (m < 1000) return "à moins d'1 km du départ";
  return `à ${Math.round(m / 1000)} km du départ`;
}

/** « 28 km », « 850 m » */
export function longueurTexte(m: number): string {
  if (m < 1000) return `${Math.round(m / 50) * 50} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

/** « 35 min », « 1 h 10 » */
export function dureeTexte(secondes: number): string {
  const min = Math.max(1, Math.round(secondes / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const reste = min % 60;
  return reste === 0 ? `${h} h` : `${h} h ${String(reste).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------
// Textes des notifications (envoyées par le serveur). Factuels, sans
// emoji ni « touche ici » (voir alertPayload de lib/push-server.ts).
// ---------------------------------------------------------------------

/** Complément d'une alerte de danger reçue au titre du trajet. */
export function texteSurTrajet(depuisDepartM: number | null | undefined): string {
  const d = depuisDepartTexte(depuisDepartM);
  return d ? `sur ton trajet, ${d}` : "sur ton trajet";
}

export interface ProblemeAvantDepart {
  id: string;
  type: ReportType;
  lieu: string | null;
  depuis_depart_m: number | null;
}

/** Heure de Nouméa d'un instant, « HH:MM ». */
export function heureNoumea(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", { timeZone: "Pacific/Noumea", hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Point « avant départ ». Ex. « Trajet de 6 h 30 · 2 dangers » /
 * « Route coupée · RT1, Païta, à 5 km du départ. Inondation · Dumbéa, à 12 km
 * du départ. Vérifie avant de partir. »
 */
export function texteAvantDepart(input: {
  sens: "aller" | "retour";
  depart: string;
  nb: number;
  problemes: ProblemeAvantDepart[];
}): { title: string; body: string } {
  const heure = heureNoumea(input.depart);
  const quand = heure ? ` de ${heureTexte(heure)}` : "";
  const nb = Math.max(input.nb, input.problemes.length);
  const title = `${input.sens === "retour" ? "Retour" : "Trajet"}${quand} · ${nb} danger${nb > 1 ? "s" : ""}`;
  const lignes = input.problemes.slice(0, 3).map((p) => {
    const quoi = [REPORT_TYPE_LABELS[p.type] ?? "Danger", p.lieu].filter(Boolean).join(" · ");
    const ou = depuisDepartTexte(p.depuis_depart_m);
    return ou ? `${quoi}, ${ou}.` : `${quoi}.`;
  });
  const reste = nb - lignes.length;
  if (reste > 0) lignes.push(`Et ${reste} autre${reste > 1 ? "s" : ""}.`);
  lignes.push("Vérifie avant de partir.");
  return { title, body: lignes.join(" ") };
}

/** « Fin d'alerte · Route coupée · RT1, Païta » / « Déclaré terminé… » */
export function texteFinAlerte(type: ReportType, lieu: string | null): { title: string; body: string } {
  const quoi = [REPORT_TYPE_LABELS[type] ?? "Danger", lieu].filter(Boolean).join(" · ");
  return {
    title: `Fin d'alerte · ${quoi}`,
    body: "Déclaré terminé : ce danger n'est plus signalé sur ton trajet. Reste prudent.",
  };
}

// ---------------------------------------------------------------------
// Mémoire sur le téléphone (localStorage). Le trajet marche sans les
// alertes : le point sur le trajet s'affiche à l'ouverture de l'appli.
// ---------------------------------------------------------------------

export const TRAJET_CLE = "vigie-nc:trajet-v1";
/** Envoyé sur `window` quand le trajet change (accueil, écran Alertes). */
export const TRAJET_EVENT = "vigie-nc:trajet";
/** Invitation « Ajoute ton trajet » fermée sur l'accueil. */
export const TRAJET_INVITE_CLE = "vigie-nc:trajet-invite";

export interface TrajetLocal {
  v: 1;
  /** Ligne surveillée, sans les extrémités. */
  points: Point[];
  longueurM: number;
  /** Trajet complet calculé (pour l'affichage) */
  distanceTotaleM: number | null;
  dureeS: number | null;
  jours: number;
  aller: string | null;
  retour: string | null;
  majAt: string;
}

function estPoint(p: unknown): p is Point {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    typeof p[0] === "number" &&
    typeof p[1] === "number" &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1])
  );
}

/** Relit un trajet gardé (null s'il est absent ou abîmé). */
export function lireTrajetTexte(texte: string | null): TrajetLocal | null {
  if (!texte) return null;
  try {
    const t = JSON.parse(texte) as Partial<TrajetLocal>;
    if (t.v !== 1 || !Array.isArray(t.points) || t.points.length < 2 || !t.points.every(estPoint)) return null;
    if (typeof t.jours !== "number" || t.jours < 1 || t.jours > JOURS_TOUS) return null;
    const aller = heureValide(t.aller) ? t.aller : null;
    const retour = heureValide(t.retour) ? t.retour : null;
    if (!aller && !retour) return null;
    return {
      v: 1,
      points: t.points,
      longueurM: typeof t.longueurM === "number" ? t.longueurM : Math.round(longueurLigne(t.points)),
      distanceTotaleM: typeof t.distanceTotaleM === "number" ? t.distanceTotaleM : null,
      dureeS: typeof t.dureeS === "number" ? t.dureeS : null,
      jours: t.jours,
      aller,
      retour,
      majAt: typeof t.majAt === "string" ? t.majAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function lireTrajet(): TrajetLocal | null {
  try {
    return lireTrajetTexte(window.localStorage.getItem(TRAJET_CLE));
  } catch {
    return null;
  }
}

function prevenir(): void {
  try {
    window.dispatchEvent(new Event(TRAJET_EVENT));
  } catch {
    // pas de fenêtre (serveur) : rien à prévenir
  }
}

export function garderTrajet(t: TrajetLocal): void {
  try {
    window.localStorage.setItem(TRAJET_CLE, JSON.stringify(t));
  } catch {
    // stockage indisponible : le trajet ne survivra pas à la fermeture
  }
  prevenir();
}

export function oublierTrajet(): void {
  try {
    window.localStorage.removeItem(TRAJET_CLE);
  } catch {
    // rien à faire
  }
  prevenir();
}
