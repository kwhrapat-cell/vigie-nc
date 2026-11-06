"use client";

// Réglages gardés sur le téléphone (jamais envoyés au serveur).

import { demoActive } from "./demo";
import type { LatLng } from "./geo";

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
  // Démonstration Mont-Dore : les vrais réglages ne changent pas.
  if (demoActive()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // stockage indisponible : le choix vaut pour cette visite seulement
  }
}

function remove(key: string): void {
  if (demoActive()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // stockage indisponible : rien à effacer
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
  // Démonstration : vue d'ensemble, cadrée sur le Mont-Dore (components/LiveMap).
  if (demoActive()) return "nc";
  const v = read(ZONE_KEY);
  if (v === "nc") return "nc";
  if (v == null && parDefaut != null) return parDefaut;
  return readRadiusKm();
}

export function saveZoneChoice(zone: ZoneChoice): void {
  write(ZONE_KEY, String(zone));
  if (zone !== "nc") saveRadiusKm(zone);
}

// « Ma zone » choisie sur la carte, quand l'appareil ne donne pas sa
// position (refusée, introuvable, ordinateur d'une mairie bloqué par son
// service informatique…) : le centre de la zone surveillée, gardé sur
// l'appareil. Ne remplace JAMAIS la vraie position : dès que l'appareil la
// donne, c'est elle qui compte, et seule la vraie position sert aux votes
// (« Toujours là » / « C'est terminé ») et à « Tu passes par là ? ».
const POINT_ZONE_KEY = "vigie-nc:point-zone";

/** Limites larges de la Nouvelle-Calédonie, îles comprises. */
export const LIMITES_NC = { latMin: -23.2, latMax: -19.0, lngMin: 163.0, lngMax: 168.8 } as const;

export function dansLaCaledonie(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= LIMITES_NC.latMin &&
    p.lat <= LIMITES_NC.latMax &&
    p.lng >= LIMITES_NC.lngMin &&
    p.lng <= LIMITES_NC.lngMax
  );
}

/** Lit le point gardé (texte JSON) ; null s'il est absent, abîmé ou hors de la Calédonie. */
export function lirePointZone(texte: string | null): LatLng | null {
  if (!texte) return null;
  try {
    const v = JSON.parse(texte) as { lat?: unknown; lng?: unknown };
    if (typeof v?.lat !== "number" || typeof v?.lng !== "number") return null;
    const p = { lat: v.lat, lng: v.lng };
    return dansLaCaledonie(p) ? p : null;
  } catch {
    return null;
  }
}

export function readPointZone(): LatLng | null {
  // Démonstration : position simulée à Boulari, pas de zone choisie.
  if (demoActive()) return null;
  return lirePointZone(read(POINT_ZONE_KEY));
}

/** Garde le point (arrondi à ~1 m) ; refusé hors de la Calédonie. */
export function savePointZone(p: LatLng): boolean {
  if (!dansLaCaledonie(p)) return false;
  const arrondi = (x: number) => Math.round(x * 1e5) / 1e5;
  write(POINT_ZONE_KEY, JSON.stringify({ lat: arrondi(p.lat), lng: arrondi(p.lng) }));
  return true;
}

export function effacerPointZone(): void {
  remove(POINT_ZONE_KEY);
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
