"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { demoActive } from "@/lib/demo";
import { ECART_ENVOIS_MS, EN_ATTENTE_EVENT, lireEnAttente, prochainAEnvoyer } from "@/lib/en-attente";
import { envoyerEnAttente } from "@/lib/en-attente-envoi";

// Essai toutes les 30 s tant qu'il reste un signalement à envoyer (un
// envoi échoue tout de suite sans réseau : ça ne coûte rien).
const ESSAI_MS = 30_000;

/**
 * Envoie tout seul les signalements faits sans réseau (lib/en-attente.ts),
 * un par minute au plus (limite de la base), dès que ça capte : au retour
 * du réseau, en revenant sur l'appli, ou à l'essai suivant. Rien à
 * l'écran : la carte « Gardé sur ton téléphone » est dans la liste
 * (components/EnAttenteCarte.tsx).
 */
export function EnvoiEnAttente() {
  useEffect(() => {
    // Démonstration : jamais (la file contient de vrais signalements, la
    // démo écrirait dans ses données fictives).
    if (!supabase || demoActive()) return;
    let enCours = false;
    let dernierEnvoi = 0;

    const tenter = async () => {
      if (enCours || demoActive()) return;
      if (Date.now() - dernierEnvoi < ECART_ENVOIS_MS) return;
      const s = prochainAEnvoyer(lireEnAttente(), Date.now());
      if (!s) return;
      enCours = true;
      try {
        const r = await envoyerEnAttente(s);
        if (r === "envoye" || r === "attendre") dernierEnvoi = Date.now();
      } finally {
        enCours = false;
      }
    };
    const surChangement = () => {
      void tenter();
    };
    const auRetour = () => {
      if (document.visibilityState === "visible") void tenter();
    };

    // Petit délai à l'ouverture : la session anonyme s'ouvre d'abord (SessionInit).
    const depart = window.setTimeout(surChangement, 3_000);
    const minuteur = window.setInterval(surChangement, ESSAI_MS);
    window.addEventListener("online", surChangement);
    window.addEventListener(EN_ATTENTE_EVENT, surChangement);
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      window.clearTimeout(depart);
      window.clearInterval(minuteur);
      window.removeEventListener("online", surChangement);
      window.removeEventListener(EN_ATTENTE_EVENT, surChangement);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, []);
  return null;
}
