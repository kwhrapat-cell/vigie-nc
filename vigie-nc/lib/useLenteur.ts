"use client";

import { useEffect, useState } from "react";
import { CHARGEMENT_LENT_MS } from "./legende";

/**
 * Vrai quand `enCours` dure depuis plus de CHARGEMENT_LENT_MS (lib/legende.ts) :
 * la carte ou la liste le dit et propose de réessayer, au lieu d'un
 * « Chargement… » sans fin. Repasse à faux dès que ça n'est plus en cours.
 */
export function useLenteur(enCours: boolean, delaiMs: number = CHARGEMENT_LENT_MS): boolean {
  const [lent, setLent] = useState(false);
  useEffect(() => {
    if (!enCours) {
      setLent(false);
      return;
    }
    const t = window.setTimeout(() => setLent(true), delaiMs);
    return () => window.clearTimeout(t);
  }, [enCours, delaiMs]);
  return lent;
}
