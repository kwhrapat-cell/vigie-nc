import { Report } from "./types";

// Les 4 niveaux de fiabilité des maquettes. Le nombre de « personnes »
// compte l'auteur du signalement + celles qui ont confirmé.
export type ReliabilityLevel = "signalement" | "a_confirmer" | "confirme" | "verifie";

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
  { level: "signalement", label: "Signalement", rule: "1 personne" },
  { level: "a_confirmer", label: "À confirmer", rule: "2 à 3 personnes" },
  { level: "confirme", label: "Confirmé", rule: "4 personnes et +" },
  { level: "verifie", label: "Vérifié", rule: "Source officielle" },
];

export const RELIABILITY_HEX: Record<ReliabilityLevel, string> = {
  signalement: "#E5484D",
  a_confirmer: "#F0912E",
  confirme: "#2BB673",
  verifie: "#3B82F6",
};

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
      detail: "Info relayée, pas encore confirmée sur place",
      contested,
    };
  }
  if (people >= 4) {
    return { level: "confirme", label: "Confirmé", people, detail: `${people} personnes`, contested };
  }
  if (people >= 2) {
    return { level: "a_confirmer", label: "À confirmer", people, detail: `${people} personnes`, contested };
  }
  return { level: "signalement", label: "Signalement", people, detail: "1 personne", contested };
}
