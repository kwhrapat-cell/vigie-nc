// « Mon impact » : ce que ce téléphone a apporté à Vigie NC. Tout reste
// sur le téléphone (localStorage) : rien n'est envoyé, pas de nom, pas de
// classement (un classement pousserait à inventer des signalements). Sert
// au bandeau « Ton signalement a servi » de l'accueil et à la carte
// « Mon impact » du Profil, avec ses badges.

import { ReportType } from "./types";

const CLE = "vigie-nc:impact-v1";
// Signalements gardés en mémoire (les plus récents).
const MAX_SIGNALEMENTS = 30;
// On vérifie si un signalement a servi pendant ce temps après sa création.
export const IMPACT_SUIVI_MS = 3 * 24 * 3600_000;
// Pas plus d'une vérification (quelques lectures publiques) par période.
export const IMPACT_VERIF_INTERVALLE_MS = 10 * 60_000;
// Signalements vérifiés au plus à chaque fois.
export const IMPACT_VERIF_MAX = 5;

export interface MonSignalement {
  id: string;
  type: ReportType;
  lieu: string | null;
  creeLe: string; // ISO
  // Déjà sur la carte quand on l'a signalé : notre signalement a compté
  // comme une confirmation. Ses confirmations d'avant ne sont pas « pour nous ».
  fusionne: boolean;
  // Confirmations déjà comptées (null = pas encore lues, pour un fusionné).
  confirmationsVues: number | null;
  // Plus en cours : on arrête de le suivre.
  fini: boolean;
}

export interface Impact {
  signalements: MonSignalement[];
  nbSignalements: number;
  nbConfirmationsRecues: number; // confirmations reçues sur mes signalements
  nbSignalementsConfirmes: number; // signalements confirmés par au moins une autre personne
  nbVotes: number; // « Toujours là » / « C'est terminé » donnés
  nbRoutesRouvertes: number; // « C'est terminé » qui a retiré un signalement
  nbAlertesMeteo: number; // inondations et météo dangereuse signalées
  nbJours: number; // jours différents où l'appli a été ouverte
  dernierJour: string | null; // AAAA-MM-JJ
  derniereVerif: number; // heure de la dernière vérification (ms)
}

const VIDE: Impact = {
  signalements: [],
  nbSignalements: 0,
  nbConfirmationsRecues: 0,
  nbSignalementsConfirmes: 0,
  nbVotes: 0,
  nbRoutesRouvertes: 0,
  nbAlertesMeteo: 0,
  nbJours: 0,
  dernierJour: null,
  derniereVerif: 0,
};

export function lireImpact(): Impact {
  try {
    const brut = window.localStorage.getItem(CLE);
    if (!brut) return { ...VIDE, signalements: [] };
    const lu = JSON.parse(brut) as Partial<Impact>;
    return {
      ...VIDE,
      ...lu,
      signalements: Array.isArray(lu.signalements) ? lu.signalements : [],
    };
  } catch {
    return { ...VIDE, signalements: [] };
  }
}

function ecrire(impact: Impact): void {
  try {
    window.localStorage.setItem(CLE, JSON.stringify(impact));
  } catch {
    // stockage indisponible : l'impact repartira de zéro
  }
}

/** Un signalement publié (ou relayé) depuis ce téléphone. */
export function noterSignalement(
  id: string,
  type: ReportType,
  lieu: string | null | undefined,
  dejaSurLaCarte: boolean,
): void {
  const impact = lireImpact();
  if (impact.signalements.some((s) => s.id === id)) return; // déjà compté
  impact.signalements = [
    {
      id,
      type,
      lieu: lieu ?? null,
      creeLe: new Date().toISOString(),
      fusionne: dejaSurLaCarte,
      confirmationsVues: dejaSurLaCarte ? null : 0,
      fini: false,
    },
    ...impact.signalements,
  ].slice(0, MAX_SIGNALEMENTS);
  impact.nbSignalements += 1;
  if (type === "inondation" || type === "meteo") impact.nbAlertesMeteo += 1;
  ecrire(impact);
}

/** Un vote donné depuis ce téléphone. */
export function noterVote(vote: "present" | "termine", resultat: string, resolu: boolean): void {
  if (resultat === "deja_vote") return;
  const impact = lireImpact();
  impact.nbVotes += 1;
  if (vote === "termine" && resolu) impact.nbRoutesRouvertes += 1;
  ecrire(impact);
}

/** Ouverture de l'appli : compte les jours différents d'utilisation. */
export function noterOuverture(): void {
  const jour = new Date().toISOString().slice(0, 10);
  const impact = lireImpact();
  if (impact.dernierJour === jour) return;
  impact.dernierJour = jour;
  impact.nbJours += 1;
  ecrire(impact);
}

/** Mes signalements à vérifier maintenant (null si c'est trop tôt). */
export function aVerifier(maintenant = Date.now()): MonSignalement[] | null {
  const impact = lireImpact();
  if (maintenant - impact.derniereVerif < IMPACT_VERIF_INTERVALLE_MS) return null;
  impact.derniereVerif = maintenant;
  ecrire(impact);
  return impact.signalements
    .filter((s) => !s.fini && maintenant - new Date(s.creeLe).getTime() < IMPACT_SUIVI_MS)
    .slice(0, IMPACT_VERIF_MAX);
}

export interface NouvelleConfirmation {
  signalement: MonSignalement;
  total: number; // confirmations au total sur ce signalement
}

/**
 * Nouvelles du serveur pour un de mes signalements. Renvoie la bonne
 * nouvelle à montrer (de nouvelles confirmations), ou null.
 */
export function noterNouvelles(id: string, confirmations: number, actif: boolean): NouvelleConfirmation | null {
  const impact = lireImpact();
  const s = impact.signalements.find((x) => x.id === id);
  if (!s) return null;
  let nouvelle: NouvelleConfirmation | null = null;
  if (s.confirmationsVues == null) {
    // Signalement fusionné, première lecture : point de départ, sans fête.
    s.confirmationsVues = confirmations;
  } else if (confirmations > s.confirmationsVues) {
    if (s.confirmationsVues === 0 && !s.fusionne) impact.nbSignalementsConfirmes += 1;
    impact.nbConfirmationsRecues += confirmations - s.confirmationsVues;
    s.confirmationsVues = confirmations;
    nouvelle = { signalement: { ...s }, total: confirmations };
  }
  if (!actif) s.fini = true;
  ecrire(impact);
  return nouvelle;
}

// ---------------------------------------------------------------------
// Badges : à garder pour soi, pas de compétition.
// ---------------------------------------------------------------------

export interface Badge {
  id: string;
  emoji: string;
  nom: string;
  comment: string; // comment l'obtenir
  obtenu: (i: Impact) => boolean;
}

export const BADGES: Badge[] = [
  {
    id: "premiere-vigie",
    emoji: "🌱",
    nom: "Première vigie",
    comment: "Fais ton premier signalement.",
    obtenu: (i) => i.nbSignalements >= 1,
  },
  {
    id: "bon-oeil",
    emoji: "👀",
    nom: "Bon œil",
    comment: "Un de tes signalements est confirmé par quelqu'un d'autre.",
    obtenu: (i) => i.nbSignalementsConfirmes >= 1,
  },
  {
    id: "temoin-fiable",
    emoji: "🤝",
    nom: "Témoin fiable",
    comment: "Réponds 5 fois « Toujours là » ou « C'est terminé ».",
    obtenu: (i) => i.nbVotes >= 5,
  },
  {
    id: "ouvreur-de-route",
    emoji: "🛣️",
    nom: "Ouvreur de route",
    comment: "Ton « C'est terminé » retire un signalement fini de la carte.",
    obtenu: (i) => i.nbRoutesRouvertes >= 1,
  },
  {
    id: "sentinelle-cyclone",
    emoji: "🌀",
    nom: "Sentinelle cyclone",
    comment: "Signale une inondation ou une météo dangereuse.",
    obtenu: (i) => i.nbAlertesMeteo >= 1,
  },
  {
    id: "vigie-du-quartier",
    emoji: "🏘️",
    nom: "Vigie du quartier",
    comment: "Fais 10 signalements.",
    obtenu: (i) => i.nbSignalements >= 10,
  },
  {
    id: "fidele-au-poste",
    emoji: "📅",
    nom: "Fidèle au poste",
    comment: "Ouvre Vigie NC 7 jours différents.",
    obtenu: (i) => i.nbJours >= 7,
  },
];

/** Identifiants des badges déjà obtenus. */
export function idsBadges(impact: Impact = lireImpact()): string[] {
  return BADGES.filter((b) => b.obtenu(impact)).map((b) => b.id);
}

/** Badges gagnés depuis `avant` (liste prise avant l'action). */
export function nouveauxBadges(avant: string[]): Badge[] {
  const impact = lireImpact();
  return BADGES.filter((b) => b.obtenu(impact) && !avant.includes(b.id));
}

/** « Nouveau badge : 🌱 Première vigie ! » (ou rien). */
export function texteNouveauxBadges(badges: Badge[]): string {
  if (badges.length === 0) return "";
  return `Nouveau badge : ${badges.map((b) => `${b.emoji} ${b.nom}`).join(", ")} !`;
}
