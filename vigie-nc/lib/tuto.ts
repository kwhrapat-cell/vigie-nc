// Démo d'accueil (« les gestes de base ») et astuce sur le bouton « + ».
// Tout reste sur le téléphone (localStorage) : rien n'est envoyé.

/** Cartes de la démo, dans l'ordre. La dernière porte les règles. */
export const TUTO_CARTES = ["voir", "signaler", "confirmer", "regles"] as const;
export type TutoCarte = (typeof TUTO_CARTES)[number];
export const TUTO_DERNIERE = TUTO_CARTES.length - 1;

/** Carte suivante (s'arrête sur la dernière). */
export function carteSuivante(i: number): number {
  return Math.min(Math.max(i + 1, 0), TUTO_DERNIERE);
}

/** Carte précédente (s'arrête sur la première). */
export function cartePrecedente(i: number): number {
  return Math.max(Math.min(i - 1, TUTO_DERNIERE), 0);
}

// Un glissement du doigt compte s'il fait au moins 50 px, et s'il est
// nettement plus horizontal que vertical (sinon c'est un défilement).
export const GLISSE_MIN_PX = 50;

/**
 * Sens d'un glissement du doigt : vers la gauche = carte suivante,
 * vers la droite = carte précédente, sinon rien.
 */
export function directionGlisse(dx: number, dy: number): "suivante" | "precedente" | null {
  if (Math.abs(dx) < GLISSE_MIN_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "suivante" : "precedente";
}

// --- Astuce « Touche ici pour signaler » sur le bouton « + » ---------------
// Montrée seulement aux nouveaux : l'accueil la met « à montrer » quand on le
// ferme la première fois. Toucher le « + » ou la fermer la passe à « vue ».
// Les personnes qui avaient déjà vu l'accueil ne la voient jamais.
export const ASTUCE_SIGNALER_KEY = "vigie-nc:astuce-signaler";
export const ASTUCE_SIGNALER_EVENT = "vigie-nc:astuce-signaler-change";
export type AstuceEtat = "a-montrer" | "vue";

export function astuceAMontrer(valeur: string | null): boolean {
  return valeur === "a-montrer";
}

export function lireAstuceSignaler(): boolean {
  try {
    return astuceAMontrer(window.localStorage.getItem(ASTUCE_SIGNALER_KEY));
  } catch {
    return false;
  }
}

export function ecrireAstuceSignaler(etat: AstuceEtat): void {
  try {
    // Ne jamais remontrer une astuce déjà vue.
    if (etat === "a-montrer" && window.localStorage.getItem(ASTUCE_SIGNALER_KEY) === "vue") return;
    window.localStorage.setItem(ASTUCE_SIGNALER_KEY, etat);
  } catch {
    // stockage indisponible : pas d'astuce, ce n'est pas grave
  }
  try {
    window.dispatchEvent(new Event(ASTUCE_SIGNALER_EVENT));
  } catch {
    // pas de fenêtre (rendu serveur)
  }
}
