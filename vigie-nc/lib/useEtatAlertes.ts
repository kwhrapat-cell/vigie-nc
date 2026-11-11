"use client";

import { useEffect, useState } from "react";
import type { EtatAlertes } from "./alertes-ecran";
import { appliIntegree } from "./navigateur-integre";
import { ALERTES_EVENT, currentSubscription, pushSupport } from "./push";
import { notifAvailable, notifGetZone } from "./reports-api";
import { lireTrajet, TRAJET_EVENT } from "./trajet";

/**
 * État des alertes de ce téléphone (onglet « En cours » de l'écran
 * Alertes) et présence d'un trajet favori. Relu quand l'écran « Être
 * prévenu » les change (ALERTES_EVENT, TRAJET_EVENT).
 */
export function useEtatAlertes(): { etat: EtatAlertes; avecTrajet: boolean } {
  const [etat, setEtat] = useState<EtatAlertes>({ etat: "chargement" });
  const [avecTrajet, setAvecTrajet] = useState(false);

  useEffect(() => {
    let annule = false;
    const lire = async () => {
      setAvecTrajet(Boolean(lireTrajet()));
      const integree = appliIntegree();
      if (integree) return setEtat({ etat: "indisponible", raison: "appli-integree" });
      const support = pushSupport();
      if (support !== "ok") return setEtat({ etat: "indisponible", raison: support });
      if (!notifAvailable) return setEtat({ etat: "indisponible", raison: "non-configure" });
      try {
        const k = await currentSubscription();
        const zone = k ? await notifGetZone(k.endpoint) : null;
        if (!annule) setEtat(zone ? { etat: "actif", zone } : { etat: "inactif" });
      } catch {
        if (!annule) setEtat({ etat: "inconnu" });
      }
    };
    void lire();
    const relire = () => void lire();
    window.addEventListener(ALERTES_EVENT, relire);
    window.addEventListener(TRAJET_EVENT, relire);
    return () => {
      annule = true;
      window.removeEventListener(ALERTES_EVENT, relire);
      window.removeEventListener(TRAJET_EVENT, relire);
    };
  }, []);

  return { etat, avecTrajet };
}
