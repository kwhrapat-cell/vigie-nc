import { Report } from "./types";

export type ReliabilityLevel = "non_confirme" | "confirme" | "fiable" | "incertain";

export interface Reliability {
  level: ReliabilityLevel;
  label: string;
  detail: string;
}

/**
 * Niveau de fiabilité affiché à l'utilisateur, calculé à partir des votes
 * des autres usagers (l'auteur du signalement ne compte pas).
 */
export function getReliability(
  r: Pick<Report, "confirmations" | "infirmations">,
): Reliability {
  const c = r.confirmations;
  const i = r.infirmations;

  if (i > 0 && i >= c) {
    return {
      level: "incertain",
      label: "Peut-être terminé",
      detail:
        i > 1
          ? `${i} personnes disent que c'est terminé`
          : "Une personne dit que c'est terminé",
    };
  }
  if (c >= 3) {
    return { level: "fiable", label: "Fiable", detail: `Confirmé par ${c} personnes` };
  }
  if (c >= 1) {
    return {
      level: "confirme",
      label: "Confirmé",
      detail: c > 1 ? `Confirmé par ${c} personnes` : "Confirmé par une autre personne",
    };
  }
  return {
    level: "non_confirme",
    label: "Non confirmé",
    detail: "Un seul signalement pour l'instant",
  };
}

// Classes Tailwind du badge, par niveau.
export const RELIABILITY_BADGE: Record<ReliabilityLevel, string> = {
  fiable: "bg-lagoon/20 text-lagoon border-lagoon/40",
  confirme: "bg-lagoon/10 text-lagoon-dim border-lagoon/25",
  non_confirme: "bg-white/[0.04] text-mist-dim border-white/[0.12]",
  incertain: "bg-ochre/10 text-ochre border-ochre/30",
};
