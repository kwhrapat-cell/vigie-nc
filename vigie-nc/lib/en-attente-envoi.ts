"use client";

// Envoi d'un signalement gardé sans réseau (lib/en-attente.ts). Utilisé par
// l'envoi automatique (components/EnvoiEnAttente.tsx).

import { createReport, errorMessage, ReportsApiError } from "./reports-api";
import { reversePlace } from "./place";
import {
  avecDelai,
  DELAI_RESEAU_MS,
  EN_ATTENTE_ENVOYE_EVENT,
  estErreurReseau,
  majEnAttente,
  retirerEnAttente,
  SignalementEnAttente,
} from "./en-attente";

export type ResultatEnvoi = "envoye" | "reseau" | "attendre" | "refuse";

/** Erreur inconnue de la base (pas le réseau) : quelques essais, puis on arrête. */
const ESSAIS_INCONNU_MAX = 3;

export async function envoyerEnAttente(s: SignalementEnAttente): Promise<ResultatEnvoi> {
  try {
    // Nom du lieu pas trouvé sans réseau : on le cherche maintenant.
    const place = s.place ?? (await reversePlace(s.lat, s.lng).catch(() => null));
    await avecDelai(
      createReport({
        type: s.type,
        lat: s.lat,
        lng: s.lng,
        photoUrl: null,
        description: s.description,
        riskLevel: s.riskLevel,
        place,
      }),
      DELAI_RESEAU_MS,
    );
    retirerEnAttente(s.id);
    try {
      window.dispatchEvent(new CustomEvent(EN_ATTENTE_ENVOYE_EVENT, { detail: s }));
    } catch {
      // affichage du « Parti » seulement
    }
    return "envoye";
  } catch (e) {
    const code = e instanceof ReportsApiError ? e.code : null;
    // Un signalement vient de partir de ce téléphone : on réessaie dans une minute.
    if (code === "rate_limit") return "attendre";
    const enLigne = typeof navigator === "undefined" ? true : navigator.onLine;
    if (estErreurReseau(e, enLigne)) {
      majEnAttente(s.id, { essais: s.essais + 1 });
      return "reseau";
    }
    if (code === "inconnu" && s.essais + 1 < ESSAIS_INCONNU_MAX) {
      majEnAttente(s.id, { essais: s.essais + 1 });
      return "reseau";
    }
    majEnAttente(s.id, { erreur: errorMessage(e, "Ce signalement n'a pas pu être publié.") });
    return "refuse";
  }
}
