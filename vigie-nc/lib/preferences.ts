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

export function readZoneChoice(): ZoneChoice {
  return read(ZONE_KEY) === "nc" ? "nc" : readRadiusKm();
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

// Un glissement vertical du doigt sur le haut de la liste la replie (vers
// le bas) ou la déplie (vers le haut). 40 px au moins, et nettement plus
// vertical qu'horizontal.
export const GLISSE_LISTE_MIN_PX = 40;

export function sensGlisseListe(dx: number, dy: number): "replier" | "deplier" | null {
  if (Math.abs(dy) < GLISSE_LISTE_MIN_PX) return null;
  if (Math.abs(dy) < Math.abs(dx) * 1.5) return null;
  return dy > 0 ? "replier" : "deplier";
}
