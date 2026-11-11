// Écran Alertes (revue de design du 11/11/2026) : deux onglets.
//  - « En cours » : le fil de ce qui est signalé, du plus récent au plus
//    ancien, avec la vigilance Météo-France et une ligne qui dit si ce
//    téléphone est prévenu.
//  - « Être prévenu » : les réglages (lieu d'alerte, trajet).
// Logique pure, testée par tests/alertes-ecran.test.ts.

import type { PushSupport } from "./push";
import type { AlertZone } from "./reports-api";
import type { Report } from "./types";

export type OngletAlertes = "en-cours" | "prevenir";

/** Ancres qui ouvrent l'onglet « Être prévenu » (#trajet : lien de l'accueil). */
const ANCRES_PREVENIR = ["#prevenir", "#trajet"];

export function ongletDepuisAncre(hash: string): OngletAlertes {
  return ANCRES_PREVENIR.includes(hash) ? "prevenir" : "en-cours";
}

/** État des alertes de ce téléphone, pour la ligne de l'onglet « En cours ». */
export type EtatAlertes =
  | { etat: "chargement" }
  | { etat: "actif"; zone: AlertZone }
  | { etat: "inactif" }
  /** Le téléphone ou le navigateur ne peut pas (encore) les recevoir. */
  | { etat: "indisponible"; raison: PushSupport | "appli-integree" }
  /** Pas de réseau : on ne sait pas. */
  | { etat: "inconnu" };

export interface ResumeAlertes {
  titre: string;
  detail: string;
  /** « activer » = bouton principal ; sinon un simple lien vers l'onglet. */
  action: "activer" | "regler" | "voir";
  actif: boolean;
}

const RAISONS: Record<PushSupport | "appli-integree", string> = {
  ok: "Touche pour les régler.",
  "iphone-a-installer": "Sur iPhone, ajoute d'abord l'appli à l'écran d'accueil.",
  "iphone-trop-ancien": "Ton iPhone doit être mis à jour (iOS 16.4 ou plus).",
  bloque: "Les notifications sont bloquées sur ce téléphone.",
  "non-configure": "Pas encore disponibles sur cette version de l'appli.",
  "non-supporte": "Ce navigateur ne peut pas les recevoir : ouvre Vigie NC dans Chrome.",
  "appli-integree": "Ouvre Vigie NC dans Chrome ou Safari pour les recevoir.",
};

/**
 * Ligne « Alertes actives · 5 km autour de « Maison » » ou invitation à les
 * activer. Jamais de promesse sur l'état de la route : on dit seulement
 * quand ce téléphone sera prévenu.
 */
export function resumeAlertes(e: EtatAlertes, avecTrajet: boolean): ResumeAlertes | null {
  switch (e.etat) {
    case "chargement":
      return null;
    case "actif": {
      const lieu = e.zone.nom ? `« ${e.zone.nom} »` : "ton lieu d'alerte";
      return {
        titre: "Alertes actives",
        detail: `${e.zone.rayonKm} km autour de ${lieu}${avecTrajet ? ", et ton trajet" : ""}.`,
        action: "regler",
        actif: true,
      };
    }
    case "inactif":
      return {
        titre: "Être prévenu, même l'appli fermée",
        detail: avecTrajet
          ? "Les dangers près de chez toi et sur ton trajet."
          : "Les dangers près d'un lieu que tu choisis (maison, travail…).",
        action: "activer",
        actif: false,
      };
    case "indisponible":
      return { titre: "Alertes sur ce téléphone", detail: RAISONS[e.raison], action: "voir", actif: false };
    case "inconnu":
      return {
        titre: "Mes alertes",
        detail: "Pas de réseau : impossible de vérifier tes alertes pour l'instant.",
        action: "voir",
        actif: false,
      };
  }
}

/** Fenêtre du groupe « Dernière heure ». */
export const FIL_RECENT_MIN = 60;

export interface GroupeFil<R> {
  cle: "recent" | "avant" | "chantiers";
  titre: string;
  signalements: R[];
}

type PourFil = Pick<Report, "createdAt" | "type" | "endDate">;

/**
 * Fil « En cours » : du plus récent au plus ancien, en trois groupes —
 * la dernière heure, le reste, puis les chantiers annoncés (longs, ils
 * noieraient le fil). Les groupes vides ne sont pas renvoyés.
 */
export function grouperFil<R extends PourFil>(liste: readonly R[], maintenant = Date.now()): GroupeFil<R>[] {
  const tries = [...liste].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recent: R[] = [];
  const avant: R[] = [];
  const chantiers: R[] = [];
  for (const r of tries) {
    if (r.type === "travaux" && r.endDate) chantiers.push(r);
    else if (maintenant - new Date(r.createdAt).getTime() <= FIL_RECENT_MIN * 60_000) recent.push(r);
    else avant.push(r);
  }
  const groupes: GroupeFil<R>[] = [
    { cle: "recent", titre: "Dernière heure", signalements: recent },
    { cle: "avant", titre: "Plus tôt", signalements: avant },
    { cle: "chantiers", titre: "Chantiers annoncés", signalements: chantiers },
  ];
  return groupes.filter((g) => g.signalements.length > 0);
}

/** Phrase quand le fil est vide (couleur neutre, jamais « route libre »). */
export function texteFilVide(zone: boolean, rayonKm: number): string {
  return zone ? `Rien de signalé à moins de ${rayonKm} km pour l'instant.` : "Rien de signalé en Calédonie pour l'instant.";
}
