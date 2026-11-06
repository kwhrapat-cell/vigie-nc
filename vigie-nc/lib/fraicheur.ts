// Fraîcheur d'un signalement : depuis quand on n'a plus de nouvelle (sa
// création, ou la dernière confirmation sur place — « Toujours là » ou un
// doublon fusionné, qui remplissent last_confirmed_at dans la base).
//
// « Ancien » : plus de la moitié de sa durée de vie sur la carte sans
// nouvelle (30 min au moins). Il reste affiché jusqu'à son expiration, mais
// grisé sur la carte et marqué « ancien » dans la liste et la fiche : c'est
// peut-être fini, à revérifier sur place. Jamais pour le SOS ni pour une
// source officielle (la modération s'en occupe, chantiers datés compris).

import type { Report } from "./types";
import { REPORT_TYPE_LIFETIME_MIN } from "./types";
import { formatDuration } from "./geo";

export const ANCIEN_PART_DUREE = 0.5;
export const ANCIEN_MIN_MIN = 30;

type Fraicheur = Pick<Report, "type" | "createdAt" | "lastConfirmedAt" | "officialSource">;

/** Heure (ms) de la dernière nouvelle : création ou dernière confirmation. */
export function derniereNouvelle(r: Pick<Report, "createdAt" | "lastConfirmedAt">): number {
  const cree = new Date(r.createdAt).getTime();
  const confirme = r.lastConfirmedAt ? new Date(r.lastConfirmedAt).getTime() : NaN;
  return Number.isFinite(confirme) && confirme > cree ? confirme : cree;
}

/** Minutes sans nouvelle au-delà desquelles ce type devient « ancien ». */
export function seuilAncienMin(type: Report["type"]): number {
  return Math.max(ANCIEN_MIN_MIN, REPORT_TYPE_LIFETIME_MIN[type] * ANCIEN_PART_DUREE);
}

/** Minutes écoulées depuis la dernière nouvelle. */
export function minutesSansNouvelle(r: Pick<Report, "createdAt" | "lastConfirmedAt">, maintenant: number): number {
  return Math.max(0, (maintenant - derniereNouvelle(r)) / 60_000);
}

export function estAncien(r: Fraicheur, maintenant: number = Date.now()): boolean {
  if (r.type === "sos" || r.officialSource) return false;
  return minutesSansNouvelle(r, maintenant) > seuilAncienMin(r.type);
}

/** Confirmé sur place après sa création (au moins 1 min après). */
export function aEteReconfirme(r: Pick<Report, "createdAt" | "lastConfirmedAt">): boolean {
  if (!r.lastConfirmedAt) return false;
  return new Date(r.lastConfirmedAt).getTime() - new Date(r.createdAt).getTime() >= 60_000;
}

/**
 * Pourquoi un signalement n'est plus sur la carte (fiche ouverte par un lien,
 * ou fermée entre-temps) : expiré sans nouvelle, déclaré terminé sur place,
 * ou retiré (modération). `null` s'il est encore en cours.
 */
export function statutFin(
  r: Pick<Report, "active" | "expiresAt" | "infirmations">,
  maintenant: number = Date.now(),
): "expire" | "termine" | "retire" | null {
  const expire = new Date(r.expiresAt).getTime() <= maintenant;
  if (r.active !== false && !expire) return null;
  if (expire) return "expire";
  return r.infirmations > 0 ? "termine" : "retire";
}

export const TEXTE_FIN: Record<"expire" | "termine" | "retire", string> = {
  expire: "Expiré : personne ne l'a signalé à nouveau à temps, il a été retiré de la carte.",
  termine: "Terminé : déclaré fini sur place, il a été retiré de la carte.",
  retire: "Retiré de la carte.",
};

/**
 * Heure d'un signalement pour la fiche : « à 19:14 » le jour même, sinon
 * « le 28 oct. à 08:00 » (heure du téléphone).
 */
export function heureSignalement(iso: string, maintenant: number = Date.now()): string {
  const d = new Date(iso);
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date(maintenant).toDateString()) return `à ${heure}`;
  const jour = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `le ${jour} à ${heure}`;
}

/** Ligne de la fiche : « Pas de nouvelle depuis 1 h 10 : c'est peut-être fini. » */
export function texteAncien(r: Pick<Report, "createdAt" | "lastConfirmedAt">, maintenant: number = Date.now()): string {
  return `Pas de nouvelle depuis ${formatDuration(minutesSansNouvelle(r, maintenant))} : c'est peut-être fini. À revérifier sur place.`;
}
