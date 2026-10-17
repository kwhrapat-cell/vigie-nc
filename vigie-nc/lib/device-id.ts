"use client";

// Identifiant du téléphone pour le MODE DÉMO uniquement (rien n'est
// enregistré, tout reste en mémoire). Avec la vraie base, l'identité vient
// de la session anonyme Supabase (lib/session.ts), jamais d'ici.
const STORAGE_KEY = "vigie-nc:device-hash";

let memoryFallback: string | null = null;

export function getDeviceId(): string {
  if (typeof window === "undefined") return "serveur-sans-appareil";
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Navigation privée ou stockage bloqué : identifiant valable pour la
    // session seulement.
    if (!memoryFallback) memoryFallback = crypto.randomUUID();
    return memoryFallback;
  }
}
