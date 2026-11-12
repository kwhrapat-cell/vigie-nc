"use client";

import { useEffect, useRef } from "react";
import { creerGestionnaireRetour, type GestionnaireRetour } from "./retour-fenetre";

// Branchement de lib/retour-fenetre.ts sur la page : un seul gestionnaire,
// un seul écouteur « popstate », pour toutes les fenêtres.
let gestionnaire: GestionnaireRetour | null = null;

function gestionnaireRetour(): GestionnaireRetour {
  if (!gestionnaire) {
    const g = creerGestionnaireRetour(window.history);
    window.addEventListener("popstate", (e) => g.surRetour(e.state));
    gestionnaire = g;
  }
  return gestionnaire;
}

/**
 * Tant que `ouvert` est vrai, le bouton Retour du téléphone appelle `fermer`
 * au lieu de quitter la page. À mettre dans chaque fenêtre (fiche, légende…).
 */
export function useRetourFerme(ouvert: boolean, fermer: () => void): void {
  const fermerRef = useRef(fermer);
  useEffect(() => {
    fermerRef.current = fermer;
  });
  useEffect(() => {
    if (!ouvert || typeof window === "undefined") return;
    return gestionnaireRetour().ouvrir(() => fermerRef.current());
  }, [ouvert]);
}
