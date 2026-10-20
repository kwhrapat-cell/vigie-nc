"use client";

import { useEffect } from "react";
import { notePresence } from "@/lib/reports-api";
import { ensureSession } from "@/lib/session";

// Toutes les 2 minutes tant que l'appli est affichée : de quoi compter les
// personnes connectées « en ce moment » (actives dans les 5 dernières
// minutes) sans charger la base. Le serveur n'écrit qu'une fois par minute
// au plus par téléphone.
const INTERVALLE_PRESENCE_MS = 2 * 60_000;

/** Provenance du lien d'arrivée (?src=affiche, ?src=partage…), nettoyée. */
function sourceDuLien(): string | null {
  try {
    const src = new URLSearchParams(window.location.search).get("src");
    const propre = src?.trim().toLowerCase() ?? "";
    return /^[a-z0-9_-]{1,30}$/.test(propre) ? propre : null;
  } catch {
    return null;
  }
}

/**
 * Ouvre la session anonyme dès l'arrivée sur l'appli, sans bloquer
 * l'affichage : elle est prête quand on signale ou qu'on vote. Compte
 * aussi, anonymement, que l'appli est utilisée (chiffres de /moderation).
 */
export function SessionInit() {
  useEffect(() => {
    const source = sourceDuLien();
    ensureSession()
      .then(() => notePresence(source))
      .catch(() => undefined);

    const tick = () => {
      if (document.visibilityState === "visible") notePresence(null);
    };
    const timer = window.setInterval(tick, INTERVALLE_PRESENCE_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return null;
}
