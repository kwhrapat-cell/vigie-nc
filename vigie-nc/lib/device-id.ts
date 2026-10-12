"use client";

// Même clé qu'au Sprint 1 : les téléphones déjà utilisés gardent leur
// identifiant.
const STORAGE_KEY = "vigie-nc:device-hash";

let memoryFallback: string | null = null;

/**
 * Identifiant anonyme généré une fois par téléphone, jamais lié à une
 * identité. Il reste sur l'appareil : la base de données n'en garde
 * qu'une empreinte (voir vigie_device_key dans supabase/schema.sql), qui
 * sert à l'anti-spam, à éviter qu'on confirme son propre signalement et à
 * se souvenir de son vote.
 */
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
