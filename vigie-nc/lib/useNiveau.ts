"use client";

import { useEffect, useState } from "react";
import { idsBadges, IMPACT_EVENT } from "./impact";
import { lireCagouSurCarte, NIVEAU_EVENT, rangActuel } from "./niveaux";

export interface EtatNiveau {
  rang: number; // 0 = Poussin … 4 = Légende
  nbBadges: number;
  cagouSurCarte: boolean; // réglage du Profil
  pret: boolean; // lu sur le téléphone (false au premier rendu)
}

/** Niveau du cagou, relu dès que l'impact ou le réglage change. */
export function useNiveau(): EtatNiveau {
  const [etat, setEtat] = useState<EtatNiveau>({ rang: 0, nbBadges: 0, cagouSurCarte: true, pret: false });

  useEffect(() => {
    const maj = () => {
      const nbBadges = idsBadges().length;
      setEtat({ rang: rangActuel(nbBadges), nbBadges, cagouSurCarte: lireCagouSurCarte(), pret: true });
    };
    maj();
    window.addEventListener(IMPACT_EVENT, maj);
    window.addEventListener(NIVEAU_EVENT, maj);
    window.addEventListener("storage", maj);
    return () => {
      window.removeEventListener(IMPACT_EVENT, maj);
      window.removeEventListener(NIVEAU_EVENT, maj);
      window.removeEventListener("storage", maj);
    };
  }, []);

  return etat;
}
