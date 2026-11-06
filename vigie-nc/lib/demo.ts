// Démonstration Mont-Dore (lien vigie-nc.com/demo, décision de Patrice du
// 05/11/2026) : un scénario FICTIF d'une matinée de fortes pluies au
// Mont-Dore, pour présenter Vigie NC à la mairie sans attendre une vraie
// grosse pluie.
//
// Garde-fous (la règle « jamais de faux signalements montrés au public »
// tient toujours) :
// - on n'y entre QUE par le lien /demo, en touchant « Lancer la démo » ;
// - dans cet onglet, l'appli n'a plus de base du tout (lib/supabase.ts) :
//   tout passe par le mode démo en mémoire (lib/demo-store.ts), rien n'est
//   lu ni écrit dans la vraie base, aucune session n'est ouverte ;
// - rien n'est gardé sur l'appareil : ni carte hors ligne, ni annonces,
//   ni « Mon impact », ni réglages (vrais réglages intacts à la sortie) ;
// - le bandeau « Démonstration · données fictives » reste à l'écran
//   partout (components/BandeauDemo.tsx) ;
// - la démo vit dans l'onglet (sessionStorage) : elle s'arrête quand on
//   ferme l'onglet ou qu'on touche « Quitter ».
//
// Fichier sans dépendance navigateur à l'import : testé par
// tests/demo.test.ts.

import type { RelaySource, ReportType, RiskLevel } from "./types";

export const DEMO_CLE = "vigie-nc:demo";
export const DEMO_MONT_DORE = "mont-dore";

/** La démo est-elle lancée dans cet onglet ? (toujours non côté serveur) */
export function demoActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DEMO_CLE) === DEMO_MONT_DORE;
  } catch {
    return false;
  }
}

/** Lance la démo dans cet onglet (rechargement complet). Faux si impossible. */
export function lancerDemo(): boolean {
  try {
    window.sessionStorage.setItem(DEMO_CLE, DEMO_MONT_DORE);
  } catch {
    return false;
  }
  if (!demoActive()) return false;
  window.location.replace("/");
  return true;
}

/** Quitte la démo : retour à la vraie carte (rechargement complet). */
export function quitterDemo(): void {
  try {
    window.sessionStorage.removeItem(DEMO_CLE);
  } catch {
    // rien à effacer
  }
  window.location.replace("/");
}

/** Nom affiché pour la source officielle du scénario (jamais sans « exemple »). */
export const DEMO_SOURCE = "Ville du Mont-Dore (exemple)";

/**
 * Position simulée pendant la démo : avenue des Deux Baies, à Boulari, à
 * 300 m de la mairie. Le vrai GPS n'est pas lu.
 */
export const DEMO_POSITION = { lat: -22.2312, lng: 166.5262, accuracy: 15, speed: null };

/** Cadre de la vue d'ensemble en démo : la commune au lieu de toute la Calédonie. */
export const DEMO_EMPRISE: [[number, number], [number, number]] = [
  [-22.288, 166.494],
  [-22.212, 166.652],
];

export interface DemoSignalement {
  type: Exclude<ReportType, "sos">;
  lat: number;
  lng: number;
  /** Il y a combien de minutes il a été signalé. */
  ageMin: number;
  /** « Toujours là » d'autres personnes. */
  present: number;
  /** « C'est terminé » d'autres personnes. */
  termine?: number;
  place: string;
  description?: string;
  riskLevel?: RiskLevel;
  officialSource?: string;
  relaySource?: RelaySource;
  /** Chantier de longue durée : date de fin dans N jours (travaux seulement). */
  finDansJours?: number;
}

// Repères vérifiés (cartes des fiches de Nouvelle-Calédonie Tourisme,
// 05/11/2026) : mairie (Boulari) -22.2293, 166.5233 ; Robinson -22.2232,
// 166.5081 ; parc de La Coulée -22.2355, 166.5795 ; départ des sentiers de
// Plum -22.2547, 166.6123 ; Vallon-Dore -22.2770, 166.5728 ; Mouirange
// -22.2326, 166.6408. Les signalements sont posés sur les routes proches,
// vérifié sur les captures d'écran (fond OpenStreetMap) du 05/11/2026.
export const SCENARIO_MONT_DORE: DemoSignalement[] = [
  {
    type: "inondation",
    lat: -22.2352,
    lng: 166.5805,
    ageMin: 35,
    present: 6,
    place: "RP1, pont de La Coulée",
    description: "Eau sur la chaussée au niveau du pont, environ 40 cm. Passage déconseillé, prenez une autre route.",
    riskLevel: "eleve",
    officialSource: DEMO_SOURCE,
  },
  {
    type: "route_coupee",
    lat: -22.2742,
    lng: 166.5725,
    ageMin: 50,
    present: 3,
    place: "Corniche, Vallon-Dore",
    description: "Coulée de boue sur la chaussée après la pluie de la nuit. Passage impossible pour l'instant.",
    riskLevel: "eleve",
  },
  {
    type: "inondation",
    lat: -22.229,
    lng: 166.6266,
    ageMin: 6,
    present: 0,
    place: "Route de Mouirange",
    description: "Eau sur la chaussée, ça passe encore en roulant doucement.",
    riskLevel: "moyen",
  },
  {
    type: "trafic_dense",
    lat: -22.2266,
    lng: 166.5036,
    ageMin: 10,
    present: 4,
    place: "Route express, La Conception",
    description: "Gros ralentissement vers Nouméa, ça avance au pas.",
  },
  {
    type: "accident",
    lat: -22.23,
    lng: 166.5318,
    ageMin: 20,
    present: 2,
    place: "RP1, Boulari",
    description: "Accrochage entre deux voitures, voie de droite encombrée. Pas de blessé apparent.",
    riskLevel: "moyen",
  },
  {
    type: "route_coupee",
    lat: -22.2518,
    lng: 166.61,
    ageMin: 25,
    present: 0,
    place: "RP1, vers Plum",
    relaySource: "facebook",
  },
  {
    type: "meteo",
    lat: -22.26,
    lng: 166.62,
    ageMin: 40,
    present: 3,
    place: "Plum",
    description: "Fortes pluies, visibilité réduite sur la route.",
  },
  {
    type: "inondation",
    lat: -22.2346,
    lng: 166.5742,
    ageMin: 55,
    present: 1,
    termine: 1,
    place: "RP1, Roche Liane",
    description: "Grosse flaque sur la route.",
    riskLevel: "faible",
  },
  {
    type: "chaussee_degradee",
    lat: -22.2215,
    lng: 166.512,
    ageMin: 90,
    present: 1,
    place: "Robinson",
    description: "Nids-de-poule apparus avec la pluie, attention aux deux-roues.",
    riskLevel: "faible",
  },
  {
    type: "travaux",
    lat: -22.229,
    lng: 166.537,
    ageMin: 6 * 24 * 60,
    present: 2,
    place: "RP1, Saint-Michel",
    description: "Réfection du réseau d'eaux pluviales, circulation alternée.",
    riskLevel: "faible",
    officialSource: DEMO_SOURCE,
    finDansJours: 30,
  },
];

/** Annonce générale du scénario (niveau vigilance), affichée en bandeau. */
export const ANNONCE_DEMO = {
  niveau: "vigilance" as const,
  texte:
    "Fortes pluies ce matin : eau sur la chaussée au pont de La Coulée (RP1), passage déconseillé. " +
    "Limitez vos déplacements et ne traversez jamais une route submergée.",
  source: DEMO_SOURCE,
  /** Publiée il y a 30 min, visible 3 h. */
  ageMin: 30,
  dureeMin: 180,
};
