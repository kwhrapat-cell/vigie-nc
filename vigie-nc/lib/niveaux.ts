// Niveaux du cagou : ta position sur la carte est un petit cagou qui prend
// du galon avec tes badges (lib/impact.ts), de « Poussin » à « Légende ».
// Comme les badges, tout reste sur le téléphone : personne d'autre ne voit
// ton cagou, pas de classement. Le niveau monte avec les contributions
// utiles (badges), pas avec le nombre brut de signalements, pour ne pas
// pousser aux faux signalements. Il ne redescend jamais (niveau max gardé),
// même si de nouveaux badges sont ajoutés plus tard.

export const NIVEAUX = [
  { id: "poussin", nom: "Poussin", badgesMin: 0 },
  { id: "vigie", nom: "Vigie", badgesMin: 1 },
  { id: "sentinelle", nom: "Sentinelle", badgesMin: 3 },
  { id: "gardien", nom: "Gardien", badgesMin: 6 },
  // Légende : tous les badges (voir NB_BADGES_LEGENDE, aligné sur BADGES).
  { id: "legende", nom: "Légende", badgesMin: 10 },
] as const;

export type NiveauId = (typeof NIVEAUX)[number]["id"];
export type Niveau = (typeof NIVEAUX)[number];

/** Rang (0 = Poussin … 4 = Légende) atteint avec ce nombre de badges. */
export function rangPourBadges(nbBadges: number): number {
  let rang = 0;
  NIVEAUX.forEach((n, i) => {
    if (nbBadges >= n.badgesMin) rang = i;
  });
  return rang;
}

/** Badges qu'il manque pour le niveau suivant (null au niveau Légende). */
export function badgesManquants(rang: number, nbBadges: number): number | null {
  const suivant = NIVEAUX[rang + 1];
  return suivant ? Math.max(0, suivant.badgesMin - nbBadges) : null;
}

// --- Niveau max atteint, gardé sur le téléphone ------------------------
const NIVEAU_MAX_KEY = "vigie-nc:niveau-max";
export const NIVEAU_EVENT = "vigie-nc:niveau-change";

function lireRangMax(): number {
  try {
    const v = Number(window.localStorage.getItem(NIVEAU_MAX_KEY));
    return Number.isInteger(v) && v >= 0 && v < NIVEAUX.length ? v : 0;
  } catch {
    return 0;
  }
}

/** Rang affiché : le plus haut entre celui des badges et celui déjà atteint. */
export function rangActuel(nbBadges: number): number {
  return Math.max(rangPourBadges(nbBadges), lireRangMax());
}

/**
 * Note le niveau atteint. Renvoie le nouveau niveau s'il vient de monter
 * (pour le fêter), sinon null.
 */
export function noterRang(nbBadges: number): Niveau | null {
  const avant = lireRangMax();
  const rang = rangPourBadges(nbBadges);
  if (rang <= avant) return null;
  try {
    window.localStorage.setItem(NIVEAU_MAX_KEY, String(rang));
    window.dispatchEvent(new Event(NIVEAU_EVENT));
  } catch {
    // stockage indisponible : on le fêtera à nouveau, pas grave
  }
  return NIVEAUX[rang];
}

// --- Cagou sur la carte : affiché ou point simple (réglage du Profil) ---
const CAGOU_CARTE_KEY = "vigie-nc:cagou-carte";

export function lireCagouSurCarte(): boolean {
  try {
    return window.localStorage.getItem(CAGOU_CARTE_KEY) !== "non";
  } catch {
    return true;
  }
}

export function ecrireCagouSurCarte(oui: boolean): void {
  try {
    window.localStorage.setItem(CAGOU_CARTE_KEY, oui ? "oui" : "non");
    window.dispatchEvent(new Event(NIVEAU_EVENT));
  } catch {
    // stockage indisponible : le choix vaut pour cette visite
  }
}
