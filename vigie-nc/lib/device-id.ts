"use client";

const STORAGE_KEY = "vigie-nc:device-hash";

// Identifiant anonyme généré une fois par appareil, jamais lié à une
// identité. Sert uniquement à limiter le spam d'un même appareil côté
// base de données (voir supabase/schema.sql) et, plus tard, à empêcher
// qu'un appareil confirme plusieurs fois son propre signalement.
export function getDeviceHash(): string {
  if (typeof window === "undefined") return "server";
  let hash = window.localStorage.getItem(STORAGE_KEY);
  if (!hash) {
    hash = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, hash);
  }
  return hash;
}
