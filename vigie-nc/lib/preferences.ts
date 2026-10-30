"use client";

// Réglages gardés sur le téléphone (jamais envoyés au serveur).

export const RADIUS_OPTIONS_KM = [1, 3, 5] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS_KM)[number];

/** Zone affichée sur la carte : un rayon autour de soi, ou toute la Calédonie. */
export type ZoneChoice = RadiusKm | "nc";

export type MapStyle = "plan" | "nuit" | "satellite";

const RADIUS_KEY = "vigie-nc:rayon-km";
const ZONE_KEY = "vigie-nc:zone";
const STYLE_KEY = "vigie-nc:fond-carte";
export const DEFAULT_RADIUS_KM: RadiusKm = 5;
export const DEFAULT_MAP_STYLE: MapStyle = "plan";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // stockage indisponible : le choix vaut pour cette visite seulement
  }
}

/** Dernier rayon en km choisi (utilisé aussi par Alertes et Historique). */
export function readRadiusKm(): RadiusKm {
  const v = Number(read(RADIUS_KEY));
  return (RADIUS_OPTIONS_KM as readonly number[]).includes(v) ? (v as RadiusKm) : DEFAULT_RADIUS_KM;
}

export function saveRadiusKm(km: RadiusKm): void {
  write(RADIUS_KEY, String(km));
}

/**
 * Zone choisie la dernière fois. Sans choix enregistré : `parDefaut` s'il
 * est donné (toute la Calédonie sur un ordinateur, dont la position est
 * approximative), sinon le dernier rayon.
 */
export function readZoneChoice(parDefaut?: ZoneChoice): ZoneChoice {
  const v = read(ZONE_KEY);
  if (v === "nc") return "nc";
  if (v == null && parDefaut != null) return parDefaut;
  return readRadiusKm();
}

export function saveZoneChoice(zone: ZoneChoice): void {
  write(ZONE_KEY, String(zone));
  if (zone !== "nc") saveRadiusKm(zone);
}

export function readMapStyle(): MapStyle {
  const v = read(STYLE_KEY);
  return v === "plan" || v === "nuit" || v === "satellite" ? v : DEFAULT_MAP_STYLE;
}

export function saveMapStyle(style: MapStyle): void {
  write(STYLE_KEY, style);
}

// Liste « À proximité » de l'accueil repliée (la carte prend la place) ou
// dépliée. Dépliée par défaut ; le choix est gardé sur le téléphone.
const LISTE_KEY = "vigie-nc:liste-repliee";

export function readListeRepliee(): boolean {
  return read(LISTE_KEY) === "1";
}

export function saveListeRepliee(repliee: boolean): void {
  write(LISTE_KEY, repliee ? "1" : "0");
}

// Ordinateur (960 px et plus) : panneau de gauche de l'accueil replié (la
// carte prend tout l'écran, il reste un petit bandeau) ou ouvert. Ouvert par
// défaut ; le choix est gardé sur l'appareil.
const PANNEAU_KEY = "vigie-nc:panneau-replie";

export function readPanneauReplie(): boolean {
  return read(PANNEAU_KEY) === "1";
}

export function savePanneauReplie(replie: boolean): void {
  write(PANNEAU_KEY, replie ? "1" : "0");
}

/** Un vrai ordinateur : écran large et souris (pas une tablette ni un téléphone). */
export const ECRAN_ORDI_SOURIS = "(min-width: 960px) and (hover: hover) and (pointer: fine)";

export function estOrdiSouris(): boolean {
  try {
    return window.matchMedia(ECRAN_ORDI_SOURIS).matches;
  } catch {
    return false;
  }
}

// Un glissement vertical du doigt sur le haut de la liste la replie (vers
// le bas) ou la déplie (vers le haut). 40 px au moins, et nettement plus
// vertical qu'horizontal.
export const GLISSE_LISTE_MIN_PX = 40;

export function sensGlisseListe(dx: number, dy: number): "replier" | "deplier" | null {
  if (Math.abs(dy) < GLISSE_LISTE_MIN_PX) return null;
  if (Math.abs(dy) < Math.abs(dx) * 1.5) return null;
  return dy > 0 ? "replier" : "deplier";
}

/**
 * Pendant le glissement, de combien la liste suit le doigt (px) : positif =
 * elle descend (liste dépliée, la carte grandit en direct), négatif = elle
 * remonte (liste repliée). Jamais au-delà de `maxPx`, ni dans le mauvais sens.
 */
export function suiviGlisseListe(dy: number, repliee: boolean, maxPx: number): number {
  if (repliee) return Math.max(Math.min(dy, 0), -maxPx);
  return Math.min(Math.max(dy, 0), maxPx);
}
