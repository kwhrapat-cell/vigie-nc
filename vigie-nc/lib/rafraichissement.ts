// Rythme des rechargements de la carte et des annonces (logique pure,
// testée par tests/rafraichissement.test.ts).
//
// Le direct (Supabase Realtime) prévient déjà de chaque changement : le
// rechargement complet n'est qu'un filet de sécurité. On l'espace quand le
// direct est connecté, on revient au rythme rapide quand il est coupé, et on
// ne recharge rien quand l'appli n'est pas à l'écran (elle se recharge tout
// de suite en revenant). But : moins de transfert de données pendant un
// épisode cyclonique, sans retarder les nouveaux signalements.

/** Toutes les combien de temps le minuteur regarde s'il faut recharger. */
export const VERIFICATION_MS = 60_000;

/** Toutes les combien de temps les signalements expirés sont retirés de l'écran. */
export const EXPIRATION_MS = 30_000;

/**
 * Marge : le minuteur ne tombe jamais pile (le dernier chargement finit
 * quelques centaines de millisecondes après son départ). Sans elle, le
 * rythme d'une minute deviendrait deux minutes.
 */
export const MARGE_MS = 5_000;

export interface Rythme {
  /** Direct coupé ou pas encore connecté. */
  sansDirect: number;
  /** Direct connecté : filet de sécurité seulement. */
  avecDirect: number;
}

export const RYTHME_CARTE: Rythme = { sansDirect: 60_000, avecDirect: 3 * 60_000 };
export const RYTHME_ANNONCES: Rythme = { sansDirect: 2 * 60_000, avecDirect: 6 * 60_000 };

/** Faut-il recharger maintenant ? */
export function doitRecharger(
  etat: { visible: boolean; directConnecte: boolean; depuisDernierMs: number },
  rythme: Rythme,
): boolean {
  if (!etat.visible) return false;
  const delai = etat.directConnecte ? rythme.avecDirect : rythme.sansDirect;
  return etat.depuisDernierMs >= delai - MARGE_MS;
}

/**
 * Retire les éléments arrivés à leur heure de fin. Renvoie la MÊME liste
 * si rien n'a expiré (pas de nouvel affichage pour rien).
 */
export function sansExpires<T extends { expiresAt: string }>(liste: T[], maintenant: number): T[] {
  const gardes = liste.filter((r) => new Date(r.expiresAt).getTime() > maintenant);
  return gardes.length === liste.length ? liste : gardes;
}

/**
 * Suivi de la connexion du direct. Le premier branchement ne demande rien
 * (la carte vient d'être chargée) ; un rebranchement après une coupure
 * demande un rattrapage, pour les changements manqués pendant la coupure.
 */
export function suivreDirect(): { connecte: () => boolean; statut: (s: string) => boolean } {
  let connecte = false;
  let dejaBranche = false;
  return {
    connecte: () => connecte,
    statut: (s) => {
      const maintenant = s === "SUBSCRIBED";
      const rattraper = maintenant && !connecte && dejaBranche;
      if (maintenant) dejaBranche = true;
      connecte = maintenant;
      return rattraper;
    },
  };
}
