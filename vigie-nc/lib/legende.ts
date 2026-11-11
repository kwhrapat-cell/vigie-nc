// Légende de la carte de l'accueil (components/LegendeCarte.tsx) et astuce
// « cercle + SOS » montrée une seule fois. Les textes sont ici pour être
// testés (tests/legende.test.ts) : jamais de « route libre » (décision de
// Patrice du 05/11/2026), et ils doivent dire ce que fait vraiment le code
// (SOS : app/sos/page.tsx ; position : page /confidentialite).
// Tout reste sur le téléphone (localStorage) : rien n'est envoyé.

import type { Category, ReportType } from "./types";
import { REPORT_TYPE_CATEGORY, REPORT_TYPE_LABELS, SIGNALABLE_TYPES } from "./types";
import { ACCUEIL_KEY, ASTUCE_SIGNALER_KEY } from "./tuto";

/**
 * Le SOS, sans ambiguïté : ce qu'il fait, qui le reçoit, ce qui se passe si
 * personne ne répond. Mêmes textes sur l'écran SOS (app/sos/page.tsx) et
 * dans la légende. Doit rester conforme au code de app/sos/page.tsx.
 */
export const SOS_EXPLICATION = [
  {
    titre: "Ce qu'il fait",
    texte:
      "Garde le doigt 3 secondes sur le gros bouton : un SMS déjà écrit, avec ta position, s'ouvre sur ton téléphone. C'est toi qui l'envoies. Il ne prévient pas les secours à ta place.",
  },
  {
    titre: "Qui le reçoit",
    texte:
      "Seulement tes contacts d'urgence (gardés sur ton téléphone), ou la personne à qui tu choisis de l'envoyer. Personne d'autre, pas même Vigie NC.",
  },
  {
    titre: "Ta position",
    texte:
      "Elle est dans le SMS, sous forme de lien Google Maps : seules les personnes qui le reçoivent la voient. Elle n'est ni envoyée à Vigie NC, ni publiée sur la carte.",
  },
  {
    titre: "Si ça ne marche pas",
    texte:
      "Position introuvable : tu peux prévenir tes contacts sans elle. SMS qui ne part pas, ou personne qui ne répond : Vigie NC ne le sait pas et ne relance personne. N'attends pas, appelle le 15 (SAMU), le 17 (police, gendarmerie) ou le 18 (pompiers).",
  },
] as const;

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
      "1, 3 ou 5 km : le cercle en pointillés. Il est centré sur ta position donnée par ton appareil (GPS), ou sur « Ma zone » si tu l'as choisie sur la carte. La carte et la liste montrent ce qui est signalé dedans.",
    sansPosition: "Sans ta position, tu vois toute la Calédonie, ou la zone que tu choisis sur la carte.",
  },
  couleurs: { titre: "Les couleurs" },
  reperes: {
    titre: "Les repères",
    recent: `Halo qui clignote : signalé il y a moins de ${REPERE_RECENT_MIN} minutes.`,
    pale: "Repère pâle : un seul signalement pour l'instant, ou quelqu'un dit que c'est terminé.",
    pastille: "Pastille chiffrée : plusieurs signalements proches. Touche-la ou clique dessus pour zoomer.",
    toi: "Point bleu (ou ton cagou) : toi. Toi seul le vois.",
    maZone: "Repère lagon : ta zone choisie sur la carte, quand ta position n'est pas disponible.",
    ancien: "Repère grisé : pas de nouvelle depuis un moment, c'est peut-être fini.",
  },
  fiabilite: {
    titre: "Fiabilité et fraîcheur",
    relaye: "Vu ailleurs (Facebook…), pas encore signalé sur place",
    ancien: "Pas de nouvelle depuis la moitié de sa durée sur la carte : à revérifier",
    termine: "Déclaré fini sur place : retiré de la carte",
  },
  confiance: {
    titre: "Qui publie, comment c'est vérifié",
    lignes: [
      "Tout le monde peut signaler, sans compte et sans nom, depuis l'endroit où il se trouve (1 signalement par minute au plus).",
      "Les personnes à moins de 5 km répondent « Toujours là » (un signalement de plus) ou « C'est terminé » (retiré quand assez de monde le dit).",
      "Le nombre de signalements ne prouve rien à lui seul : plusieurs téléphones anonymes peuvent venir d'une même personne. C'est pour ça qu'il n'y a jamais de « Confirmé » au nombre.",
      "Une erreur (mauvais type, mauvais endroit) se corrige avec « C'est terminé », puis un nouveau signalement.",
      "Une info vue ailleurs (Facebook…) reste « Relayé » tant que personne ne l'a signalée sur place. Seule une source officielle (mairie, province, pompiers…) la passe en « Vérifié ».",
      "Une photo ou un texte déplacé peut être signalé : il est masqué par la modération.",
      "Tant qu'elle n'est pas vérifiée, une info reste celle d'usagers : elle peut se tromper, regarde par toi-même.",
    ],
  },
  sos: {
    titre: "Le bouton SOS",
    ouvre: "Il ouvre l'écran SOS : rien ne part tout seul.",
  },
  position: {
    titre: "Ta position",
    lignes: [
      "Elle n'apparaît que sur ton écran : personne d'autre ne la voit sur la carte.",
      "Pour trouver les signalements autour de toi, elle est envoyée à la base de Vigie NC au moment de la recherche, sans être enregistrée.",
      "Le fond de carte Vigie vient de Vigie NC : les morceaux de carte demandés correspondent à la zone que tu regardes. Les autres fonds de carte (OpenStreetMap, ou Esri en satellite) la reçoivent aussi, comme pour toute carte en ligne.",
      "Sur l'écran Signaler, la position du repère est envoyée à OpenStreetMap dès l'ouverture, pour afficher le nom du lieu.",
      "Quand tu publies, seul l'endroit du signalement est gardé, jamais ton nom. Avec les alertes : le lieu choisi, arrondi à environ 1 km, et ton trajet favori sans son départ ni son arrivée.",
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
