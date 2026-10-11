// Données de démonstration de l'écran Historique (branché sur la base au Sprint 3).
// Les signalements de démo de la carte sont dans lib/demo-store.ts.
import { ZoneHistory } from "./types";

export const MOCK_ZONE_HISTORY: Record<string, ZoneHistory> = {
  "col-de-tonghoue": {
    zoneId: "col-de-tonghoue",
    zoneName: "RT1 — Col de Tonghoué",
    riskLabel: "Risque élevé par fortes pluies",
    incidentsThisYear: 12,
    monthlyCounts: [20, 10, 80, 40, 15, 8, 5, 5, 8, 12, 30, 65],
    timeline: [
      {
        id: "t1",
        text: "Route coupée — niveau d'eau au-dessus du bas-côté",
        severity: "rust",
        relativeTime: "il y a 2 j",
        confirmations: 6,
      },
      {
        id: "t2",
        text: "Chaussée inondée après fortes pluies",
        severity: "lagoon",
        relativeTime: "il y a 9 j",
        confirmations: 3,
      },
      {
        id: "t3",
        text: "Ralentissement, déviation locale en place",
        severity: "ochre",
        relativeTime: "il y a 3 sem",
        confirmations: 2,
      },
    ],
  },
};
