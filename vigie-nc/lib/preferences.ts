"use client";

// Réglages gardés sur le téléphone (jamais envoyés au serveur).

export const RADIUS_OPTIONS_KM = [1, 3, 5] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS_KM)[number];

const RADIUS_KEY = "vigie-nc:rayon-km";
export const DEFAULT_RADIUS_KM: RadiusKm = 5;

export function readRadiusKm(): RadiusKm {
  try {
    const v = Number(window.localStorage.getItem(RADIUS_KEY));
    return (RADIUS_OPTIONS_KM as readonly number[]).includes(v) ? (v as RadiusKm) : DEFAULT_RADIUS_KM;
  } catch {
    return DEFAULT_RADIUS_KM;
  }
}

export function saveRadiusKm(km: RadiusKm): void {
  try {
    window.localStorage.setItem(RADIUS_KEY, String(km));
  } catch {
    // stockage indisponible : le choix vaut pour cette visite seulement
  }
}
