// Bouton Retour d'Android (et geste retour de Safari, bouton Précédent d'un
// ordinateur) : il ferme la fenêtre ouverte — fiche, légende, aide position,
// partage du point route, choix de « Ma zone », tutoriel revu — au lieu de
// quitter la page ou l'appli (audit mobile du 11/11/2026).
//
// Chaque fenêtre ouverte ajoute une étape à l'historique du navigateur. Cette
// étape note la liste des fenêtres ouvertes à ce moment-là : quand Retour
// ramène à une étape, toute fenêtre absente de sa liste est refermée.
// Fermée autrement (croix, Échap, fond touché), la fenêtre retire elle-même
// son étape, juste après : si une autre fenêtre s'ouvre aussitôt (on passe
// d'une fiche à une autre), elle reprend la même étape au lieu d'en empiler.
//
// Logique pure (historique et minuteur fournis) : testée par
// tests/retour-fenetre.test.ts. Le branchement sur la page est dans
// lib/useRetourFerme.ts.

/** Ce dont on a besoin de window.history (un faux dans les tests). */
export interface HistoriqueMin {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  replaceState(data: unknown, unused: string): void;
  back(): void;
}

/** Clé ajoutée à l'état de l'historique (le reste, dont celui de Next.js, est gardé). */
export const CLE_FENETRES = "vigieFenetres";

/** Si Retour n'arrive pas (rien avant dans l'historique), on n'attend pas plus. */
export const RETOUR_ATTENTE_MAX_MS = 600;

interface Fenetre {
  jeton: string;
  fermer: () => void;
}

/** Liste des fenêtres notée dans une étape de l'historique ([] sans liste). */
export function fenetresDe(state: unknown): string[] {
  if (!state || typeof state !== "object") return [];
  const v = (state as Record<string, unknown>)[CLE_FENETRES];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function avecFenetres(state: unknown, jetons: string[]): Record<string, unknown> {
  const base = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  return { ...base, [CLE_FENETRES]: jetons };
}

export interface GestionnaireRetour {
  /** Une fenêtre s'ouvre ; renvoie la fonction à appeler quand elle se ferme. */
  ouvrir(fermer: () => void): () => void;
  /** À brancher sur l'événement « popstate » (state = event.state). */
  surRetour(state: unknown): void;
  /** Nombre de fenêtres ouvertes (tests). */
  ouvertes(): number;
}

export function creerGestionnaireRetour(
  h: HistoriqueMin,
  planifier: (f: () => void, ms: number) => void = (f, ms) => {
    setTimeout(f, ms);
  },
): GestionnaireRetour {
  const pile: Fenetre[] = [];
  let compteur = 0;
  // Fenêtre fermée à l'instant, dont l'étape n'est pas encore retirée.
  let enSursis: Fenetre | null = null;
  // Un retour lancé par nous est en route : les nouvelles fenêtres attendent.
  let retourEnCours = false;
  const enFile: Fenetre[] = [];

  const enHaut = () => {
    const l = fenetresDe(h.state);
    return l.length > 0 ? l[l.length - 1] : null;
  };

  function poser(f: Fenetre) {
    // Les fenêtres ouvertes avant elle, puis elle.
    const liste = pile.slice(0, pile.indexOf(f) + 1).map((x) => x.jeton);
    if (enSursis && enHaut() === enSursis.jeton) {
      // Une fenêtre vient de se fermer et une autre s'ouvre tout de suite :
      // même étape, mise à jour.
      enSursis = null;
      h.replaceState(avecFenetres(h.state, liste), "");
    } else {
      h.pushState(avecFenetres(h.state, liste), "");
    }
  }

  function viderFile() {
    retourEnCours = false;
    for (const f of enFile.splice(0)) if (pile.includes(f)) poser(f);
  }

  function retirerEtape(f: Fenetre) {
    enSursis = f;
    planifier(() => {
      if (enSursis !== f) return; // étape reprise par une nouvelle fenêtre
      enSursis = null;
      if (enHaut() !== f.jeton) return; // on a changé de page entre-temps
      retourEnCours = true;
      h.back();
      planifier(() => {
        if (retourEnCours) viderFile();
      }, RETOUR_ATTENTE_MAX_MS);
    }, 0);
  }

  return {
    ouvrir(fermer) {
      compteur += 1;
      const f: Fenetre = { jeton: `f${compteur}-${Math.random().toString(36).slice(2, 8)}`, fermer };
      pile.push(f);
      if (retourEnCours) enFile.push(f);
      else poser(f);
      return () => {
        const i = pile.indexOf(f);
        if (i === -1) return; // déjà refermée par Retour
        pile.splice(i, 1);
        const j = enFile.indexOf(f);
        if (j !== -1) {
          enFile.splice(j, 1); // jamais posée dans l'historique
          return;
        }
        const liste = fenetresDe(h.state);
        if (enHaut() === f.jeton) retirerEtape(f);
        // Fermée sous une autre fenêtre : on l'enlève de l'étape actuelle.
        else if (liste.includes(f.jeton)) h.replaceState(avecFenetres(h.state, liste.filter((x) => x !== f.jeton)), "");
      };
    },

    surRetour(state) {
      const gardees = new Set(fenetresDe(state));
      for (const f of enFile) gardees.add(f.jeton);
      const aFermer = pile.filter((f) => !gardees.has(f.jeton));
      for (const f of aFermer) pile.splice(pile.indexOf(f), 1);
      // Celle du dessus d'abord.
      for (const f of aFermer.reverse()) f.fermer();
      if (retourEnCours) viderFile();
    },

    ouvertes: () => pile.length,
  };
}
