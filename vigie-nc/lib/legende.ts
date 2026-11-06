// Légende de la carte de l'accueil (components/LegendeCarte.tsx) et astuce
// « cercle + SOS » montrée une seule fois. Les textes sont ici pour être
// testés (tests/legende.test.ts) : jamais de « route libre » (décision de
// Patrice du 05/11/2026), et ils doivent dire ce que fait vraiment le code
// (SOS : app/sos/page.tsx ; position : page /confidentialite).
// Tout reste sur le téléphone (localStorage) : rien n'est envoyé.

import type { Category, ReportType } from "./types";
import { REPORT_TYPE_CATEGORY, REPORT_TYPE_LABELS, SIGNALABLE_TYPES } from "./types";
import { ACCUEIL_KEY, ASTUCE_SIGNALER_KEY } from "./tuto";

/** Halo qui pulse autour d'un repère : signalé il y a moins de 15 min (LiveMap). */
export const REPERE_RECENT_MIN = 15;

/**
 * Carte ou liste encore « en chargement » après ce délai : on le dit et on
 * propose de réessayer, au lieu de laisser « Chargement… » sans fin.
 */
export const CHARGEMENT_LENT_MS = 12_000;

/** Types d'une catégorie, dans l'ordre de l'écran Signaler (jamais le SOS). */
export function typesDeCategorie(c: Category): Exclude<ReportType, "sos">[] {
  return SIGNALABLE_TYPES.filter((t) => REPORT_TYPE_CATEGORY[t] === c);
}

/** « accident, route coupée, feu ou fumée, danger » : les types d'une catégorie, en clair. */
export function texteTypesCategorie(c: Category): string {
  return typesDeCategorie(c)
    .map((t) => {
      const l = REPORT_TYPE_LABELS[t];
      return l.charAt(0).toLowerCase() + l.slice(1);
    })
    .join(", ");
}

/** Repère montré dans la légende pour chaque catégorie. */
export const TYPE_EXEMPLE: Record<Category, Exclude<ReportType, "sos">> = {
  danger: "accident",
  perturbation: "travaux",
  meteo: "inondation",
};

export const LEGENDE = {
  titre: "Lire la carte",
  zone: {
    titre: "Ta zone",
    nc: "Toute la Nouvelle-Calédonie.",
    ncDemo: "Tout le Mont-Dore (démonstration).",
    rayon:
      "1, 3 ou 5 km : le cercle en pointillés autour de toi. La carte et la liste montrent ce qui est signalé dedans.",
    sansPosition: "Sans ta position, tu vois toute la Calédonie, ou la zone que tu choisis sur la carte.",
  },
  couleurs: { titre: "Les couleurs" },
  reperes: {
    titre: "Les repères",
    recent: `Halo qui clignote : signalé il y a moins de ${REPERE_RECENT_MIN} minutes.`,
    pale: "Repère pâle : pas encore confirmé, ou quelqu'un dit que c'est terminé.",
    pastille: "Pastille chiffrée : plusieurs signalements proches. Touche-la ou clique dessus pour zoomer.",
    toi: "Point bleu (ou ton cagou) : toi. Toi seul le vois.",
    maZone: "Repère lagon : ta zone choisie sur la carte, quand ta position n'est pas disponible.",
  },
  fiabilite: {
    titre: "Fiabilité",
    relaye: "Vu ailleurs (Facebook…), à confirmer sur place",
  },
  sos: {
    titre: "Le bouton SOS",
    lignes: [
      "Il ouvre l'écran SOS. Rien ne part tant que tu n'as pas gardé le doigt 3 secondes sur le gros bouton.",
      "Ensuite, un SMS avec ta position est préparé pour tes contacts d'urgence : c'est toi qui l'envoies. Sur cet écran, tu peux aussi appeler le 15, le 17 ou le 18.",
      "Vigie NC ne prévient pas les secours à ta place et ne publie rien sur la carte.",
    ],
  },
  position: {
    titre: "Ta position",
    lignes: [
      "Elle n'apparaît que sur ton écran : personne d'autre ne la voit.",
      "Elle sert à chercher les signalements autour de toi, sans être enregistrée. Quand tu publies un signalement, seul son endroit est gardé, jamais ton nom.",
      "Si tu actives les alertes, sont gardés : le lieu choisi, arrondi à environ 1 km, et ton trajet favori sans son départ ni son arrivée.",
    ],
    lien: "Tout savoir sur tes données",
  },
  miseAJour: {
    titre: "Mise à jour",
    direct: "La carte se met à jour toute seule, en direct.",
    sansHeure: "L'heure de la dernière mise à jour est affichée au-dessus de la liste.",
    prudence: "« Rien de signalé » ne garantit pas que la route est dégagée : reste prudent.",
  },
  astuce: {
    cercle: "Le cercle, c'est ta zone : 1, 3 ou 5 km autour de toi.",
    sos: "SOS prépare un SMS avec ta position pour tes proches. Rien ne part sans toi, rien n'est publié.",
    legende: "Légende",
    compris: "Compris",
  },
} as const;

/** « 19:14 » (heure de l'appareil). */
export function heureCourte(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Phrase de la légende sur la dernière mise à jour. */
export function texteDerniereMiseAJour(updatedAt: Date | null): string {
  return updatedAt ? `Dernière mise à jour : ${heureCourte(updatedAt)}.` : LEGENDE.miseAJour.sansHeure;
}

/**
 * Petit texte au-dessus de la liste : chargement, chargement long, heure de
 * la dernière mise à jour, ou « Pas de connexion » si rien n'a pu être lu.
 */
export function libelleMiseAJour(
  status: "loading" | "ready" | "error",
  updatedAt: Date | null,
  lent: boolean,
): string {
  if (status === "loading") return lent ? "Chargement long…" : "Chargement…";
  if (updatedAt) return `Mis à jour à ${heureCourte(updatedAt)}`;
  return status === "error" ? "Pas de connexion" : "";
}

// --- Astuce « cercle + SOS » sur la carte --------------------------------
// Montrée une fois, après l'accueil et après l'astuce du « + » (une seule
// bulle à la fois). « Compris » ou ouvrir la légende la passe à « vue ».
export const ASTUCE_CARTE_KEY = "vigie-nc:astuce-carte";

/** Faut-il montrer l'astuce ? (valeurs lues dans le localStorage) */
export function astuceCarteAMontrer(
  astuceCarte: string | null,
  accueil: string | null,
  astuceSignaler: string | null,
): boolean {
  return astuceCarte !== "vue" && accueil === "1" && astuceSignaler !== "a-montrer";
}

export function lireAstuceCarte(): boolean {
  try {
    const s = window.localStorage;
    return astuceCarteAMontrer(s.getItem(ASTUCE_CARTE_KEY), s.getItem(ACCUEIL_KEY), s.getItem(ASTUCE_SIGNALER_KEY));
  } catch {
    // stockage indisponible : pas d'astuce (la légende reste accessible)
    return false;
  }
}

export function ecrireAstuceCarteVue(): void {
  try {
    window.localStorage.setItem(ASTUCE_CARTE_KEY, "vue");
  } catch {
    // stockage indisponible : ce n'est pas grave
  }
}
