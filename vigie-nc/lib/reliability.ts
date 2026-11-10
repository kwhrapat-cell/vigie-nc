import type { Report } from "./types";

// Niveaux de fiabilité (décision de Patrice du 06/11/2026, suite aux
// retours) : on dit seulement ce qu'on sait. « Signalé » (1 signalement),
// « Plusieurs signalements » (2 et plus), « Vérifié » (source officielle).
// Le nombre seul ne donne jamais « Confirmé » : des téléphones anonymes
// peuvent venir d'une même personne. Le nombre de signalements (`people`)
// compte l'auteur + les « Toujours là » et les doublons fusionnés.
export type ReliabilityLevel = "signalement" | "plusieurs" | "verifie";

export interface Reliability {
  level: ReliabilityLevel;
  label: string;
  people: number;
  detail: string;
  // Une ou plusieurs personnes disent que c'est terminé
  contested: string | null;
}

export const RELIABILITY_LEVELS: {
  level: ReliabilityLevel;
  label: string;
  rule: string;
}[] = [
  { level: "signalement", label: "Signalé", rule: "1 signalement" },
  { level: "plusieurs", label: "Plusieurs signalements", rule: "2 signalements et plus" },
  { level: "verifie", label: "Vérifié", rule: "Source officielle (mairie, province, pompiers…)" },
];

// Couleurs NEUTRES (revue de design du 11/11/2026) : le rouge, l'orange et
// le bleu disent la catégorie (danger, perturbation, météo) ; la fiabilité
// ne doit pas les reprendre (un simple trafic « Signalé » n'est pas une
// alerte rouge). Du gris au lagon : plus c'est sûr, plus c'est vif.
export const RELIABILITY_HEX: Record<ReliabilityLevel, string> = {
  signalement: "#93B0AD",
  plusieurs: "#D3E6E3",
  verifie: "#22B8B0",
};

/** Texte court des petites pastilles (listes) : « 3 signalements » plutôt que le libellé long. */
export function libelleCourt(rel: Reliability): string {
  return rel.level === "plusieurs" ? rel.detail : rel.label;
}

export function getReliability(
  r: Pick<Report, "confirmations" | "infirmations" | "officialSource" | "relaySource">,
): Reliability {
  // Une info relayée ne compte pas son auteur comme témoin : il ne l'a pas
  // forcément vue lui-même.
  const people = r.confirmations + (r.relaySource ? 0 : 1);
  const contested =
    r.infirmations > 0 && r.infirmations >= r.confirmations
      ? r.infirmations > 1
        ? `${r.infirmations} personnes disent que c'est terminé`
        : "Une personne dit que c'est terminé"
      : null;

  if (r.officialSource) {
    return {
      level: "verifie",
      label: "Vérifié",
      people,
      detail: `Source officielle (${r.officialSource})`,
      contested,
    };
  }
  if (people === 0) {
    return {
      level: "signalement",
      label: "Relayé",
      people,
      detail: "Info relayée, pas encore signalée sur place",
      contested,
    };
  }
  if (people >= 2) {
    return { level: "plusieurs", label: "Plusieurs signalements", people, detail: `${people} signalements`, contested };
  }
  return { level: "signalement", label: "Signalé", people, detail: "1 signalement", contested };
}
