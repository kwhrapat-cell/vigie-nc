// SERVEUR uniquement : vérification du secret partagé avec la base
// (en-tête x-vigie-secret des appels pg_net vers /api/notifier, /api/annonce,
// /api/trajet, /api/resumer, /api/alerte-securite).
//
// Comparaison à temps constant (revue de sécurité du 11/11/2026) : une
// comparaison ordinaire s'arrête au premier caractère différent, et le temps
// de réponse peut aider à deviner le secret caractère par caractère. Les deux
// valeurs sont d'abord réduites à la même longueur (empreinte SHA-256).

import { createHash, timingSafeEqual } from "node:crypto";

function empreinte(texte: string): Buffer {
  return createHash("sha256").update(texte, "utf8").digest();
}

/** Le secret reçu est-il le bon ? Faux si le secret attendu n'est pas configuré. */
export function secretValide(recu: string | null | undefined, attendu: string | null | undefined): boolean {
  if (!attendu || typeof recu !== "string" || recu.length === 0 || recu.length > 1000) return false;
  return timingSafeEqual(empreinte(recu), empreinte(attendu));
}
