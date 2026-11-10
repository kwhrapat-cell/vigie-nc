// Carte sans réseau, logique pure (tests/carte-plan.test.ts) : quelles
// tuiles télécharger pour une zone, un trajet ou toute la Calédonie, en
// combien de morceaux, et comment les retrouver ensuite sur le téléphone.

import { zxyVersTileId } from "./pmtiles";
import type { Entree } from "./pmtiles";
import type { Point } from "./trajet";

/** La carte de l'appli ne descend pas sous le zoom 6 (LiveMap minZoom). */
export const ZOOM_MIN_CARTE = 6;
/** Zoom le plus fin du fichier ; au-delà, la tuile est agrandie (sur-zoom). */
export const ZOOM_MAX_CARTE = 15;
export const RAYON_ZONE_KM = 10;
/** Bande gardée de chaque côté du trajet. */
export const MARGE_TRAJET_M = 1_500;
/** Un morceau par requête : sous la limite de réponse de Vercel (4,5 Mo). */
export const MORCEAU_MAX_OCTETS = 4_000_000;
/** Deux plages plus proches que ça sont lues d'un coup. */
export const ECART_MAX_OCTETS = 64 * 1024;

const R = 6_371_000;

export function lonVersX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

export function latVersY(lat: number, z: number): number {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

export function xVersLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

export function yVersLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Tuiles (x, y) d'un zoom qui couvrent un rectangle (ouest, sud, est, nord). */
function tuilesRectangle(z: number, o: number, s: number, e: number, n: number, ajouter: (x: number, y: number) => void): void {
  const max = 2 ** z - 1;
  const x0 = Math.max(0, Math.floor(lonVersX(o, z)));
  const x1 = Math.min(max, Math.floor(lonVersX(e, z)));
  const y0 = Math.max(0, Math.floor(latVersY(n, z)));
  const y1 = Math.min(max, Math.floor(latVersY(s, z)));
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) ajouter(x, y);
}

function degresLat(m: number): number {
  return (m / R) * (180 / Math.PI);
}

function degresLng(m: number, lat: number): number {
  return degresLat(m) / Math.max(0.01, Math.cos((lat * Math.PI) / 180));
}

/** Numéros des tuiles qui touchent le cercle, du zoom zMin à zMax, triés. */
export function tuilesCercle(lat: number, lng: number, rayonM: number, zMin = ZOOM_MIN_CARTE, zMax = ZOOM_MAX_CARTE): number[] {
  const ids: number[] = [];
  const dLat = degresLat(rayonM);
  const dLng = degresLng(rayonM, lat);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (let z = zMin; z <= zMax; z++) {
    tuilesRectangle(z, lng - dLng, lat - dLat, lng + dLng, lat + dLat, (x, y) => {
      // Point de la tuile le plus proche du centre : dans le cercle ?
      const o = xVersLon(x, z);
      const e = xVersLon(x + 1, z);
      const n = yVersLat(y, z);
      const s = yVersLat(y + 1, z);
      const pLng = Math.max(o, Math.min(e, lng));
      const pLat = Math.max(s, Math.min(n, lat));
      const dx = ((pLng - lng) * Math.PI) / 180 * R * cosLat;
      const dy = ((pLat - lat) * Math.PI) / 180 * R;
      if (dx * dx + dy * dy <= rayonM * rayonM) ids.push(zxyVersTileId(z, x, y));
    });
  }
  return ids.sort((a, b) => a - b);
}

/** Numéros des tuiles le long d'une ligne ([lat, lng]), avec une marge, triés. */
export function tuilesLigne(points: Point[], margeM = MARGE_TRAJET_M, zMin = ZOOM_MIN_CARTE, zMax = ZOOM_MAX_CARTE): number[] {
  const ids = new Set<number>();
  if (points.length === 0) return [];
  // Points tous les `pas` mètres au plus : la marge carrée autour de
  // chacun couvre la bande sans trou.
  const pas = Math.max(50, margeM / 2);
  const echantillons: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dy = ((b[0] - a[0]) * Math.PI) / 180 * R;
    const dx = ((b[1] - a[1]) * Math.PI) / 180 * R * Math.cos((a[0] * Math.PI) / 180);
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / pas));
    for (let k = 1; k <= n; k++) echantillons.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  for (let z = zMin; z <= zMax; z++) {
    for (const [lat, lng] of echantillons) {
      const dLat = degresLat(margeM);
      const dLng = degresLng(margeM, lat);
      tuilesRectangle(z, lng - dLng, lat - dLat, lng + dLng, lat + dLat, (x, y) => ids.add(zxyVersTileId(z, x, y)));
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Plages d'octets à télécharger (début inclus, fin exclue), triées : les
 * plages proches sont réunies, sans dépasser `tailleMax` par morceau
 * (sauf une tuile seule plus grande, gardée entière).
 */
export function regrouper(
  plages: { debut: number; longueur: number }[],
  ecartMax = ECART_MAX_OCTETS,
  tailleMax = MORCEAU_MAX_OCTETS,
): [number, number][] {
  const triees = plages.filter((p) => p.longueur > 0).sort((a, b) => a.debut - b.debut);
  const out: [number, number][] = [];
  for (const p of triees) {
    const fin = p.debut + p.longueur;
    const dernier = out[out.length - 1];
    if (dernier && p.debut <= dernier[1] + ecartMax && Math.max(fin, dernier[1]) - dernier[0] <= tailleMax) {
      dernier[1] = Math.max(dernier[1], fin);
    } else if (dernier && p.debut < dernier[1]) {
      // chevauche un morceau plein : on étend juste ce qu'il faut
      if (fin > dernier[1]) out.push([dernier[1], fin]);
    } else {
      out.push([p.debut, fin]);
    }
  }
  return out;
}

export function octetsTotal(morceaux: [number, number][]): number {
  return morceaux.reduce((s, [d, f]) => s + (f - d), 0);
}

// --- Index gardé sur le téléphone ----------------------------------------
// Float64Array : [nbEntrées, nbMorceaux, puis 4 nombres par entrée
// (tileId, longueurSerie, début, longueur — début depuis le début du
// fichier), puis 2 par morceau (début, fin)]. Entrées triées par tileId,
// morceaux par début.

export function encoderIndex(entrees: Entree[], morceaux: [number, number][]): ArrayBuffer {
  const v = new Float64Array(2 + entrees.length * 4 + morceaux.length * 2);
  v[0] = entrees.length;
  v[1] = morceaux.length;
  let i = 2;
  for (const e of [...entrees].sort((a, b) => a.tileId - b.tileId)) {
    v[i++] = e.tileId;
    v[i++] = e.longueurSerie;
    v[i++] = e.debut;
    v[i++] = e.longueur;
  }
  for (const [d, f] of [...morceaux].sort((a, b) => a[0] - b[0])) {
    v[i++] = d;
    v[i++] = f;
  }
  return v.buffer;
}

export interface Index {
  v: Float64Array;
  nbEntrees: number;
  nbMorceaux: number;
}

export function lireIndex(buffer: ArrayBuffer): Index | null {
  if (buffer.byteLength < 16 || buffer.byteLength % 8 !== 0) return null;
  const v = new Float64Array(buffer);
  const nbEntrees = v[0];
  const nbMorceaux = v[1];
  if (!Number.isInteger(nbEntrees) || !Number.isInteger(nbMorceaux)) return null;
  if (v.length !== 2 + nbEntrees * 4 + nbMorceaux * 2) return null;
  return { v, nbEntrees, nbMorceaux };
}

/** Tuile dans l'index : [début, longueur] dans le fichier, ou null. */
export function chercherTuile(index: Index, tileId: number): [number, number] | null {
  const { v, nbEntrees } = index;
  let bas = 0;
  let haut = nbEntrees - 1;
  while (bas <= haut) {
    const m = (bas + haut) >> 1;
    const id = v[2 + m * 4];
    if (id === tileId) return [v[2 + m * 4 + 2], v[2 + m * 4 + 3]];
    if (id < tileId) bas = m + 1;
    else haut = m - 1;
  }
  if (haut < 0) return null;
  const k = 2 + haut * 4;
  return tileId - v[k] < v[k + 1] ? [v[k + 2], v[k + 3]] : null;
}

/** Morceau qui contient la plage, ou -1. */
export function chercherMorceau(index: Index, debut: number, longueur: number): number {
  const { v, nbEntrees, nbMorceaux } = index;
  const base = 2 + nbEntrees * 4;
  let bas = 0;
  let haut = nbMorceaux - 1;
  while (bas <= haut) {
    const m = (bas + haut) >> 1;
    if (v[base + m * 2] <= debut) bas = m + 1;
    else haut = m - 1;
  }
  if (haut < 0) return -1;
  return debut + longueur <= v[base + haut * 2 + 1] ? haut : -1;
}

export function morceauDe(index: Index, i: number): [number, number] {
  const base = 2 + index.nbEntrees * 4;
  return [index.v[base + i * 2], index.v[base + i * 2 + 1]];
}

/** « 2,4 Mo », « 650 Ko » */
export function texteOctets(n: number): string {
  if (n < 1_000_000) return `${Math.max(1, Math.round(n / 1000))} Ko`;
  const mo = n / 1_000_000;
  return `${mo < 10 ? mo.toFixed(1).replace(".", ",") : Math.round(mo)} Mo`;
}
