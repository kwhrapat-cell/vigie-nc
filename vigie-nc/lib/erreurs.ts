"use client";

import { navigateurCourt, texteErreur } from "./erreurs-texte";
import { envoyerErreur } from "./reports-api";

// Erreurs des téléphones, envoyées anonymement pour que les bugs ne
// restent pas invisibles : le message, l'écran et le navigateur (nom +
// version), jamais la position, le nom ni l'identifiant de session. La
// base nettoie encore le texte (nombres longs, e-mails, fin des liens),
// regroupe les mêmes erreurs et les efface après 14 jours
// (vigie_erreur_signaler dans supabase/schema.sql). Décrit dans
// /confidentialite.

// Après une mise à jour du site, une page restée ouverte cherche des
// fichiers qui n'existent plus : on recharge (une fois) au lieu de planter.
const MISE_A_JOUR = /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i;
const CLE_RECHARGE = "vigie-nc:recharge-mise-a-jour";
const MAX_PAR_PAGE = 5;

const dejaEnvoyees = new Set<string>();

/** Recharge une fois si l'erreur vient d'une mise à jour du site ; true si c'est le cas. */
function rechargerSiMiseAJour(texte: string): boolean {
  if (!MISE_A_JOUR.test(texte)) return false;
  try {
    const avant = Number(window.sessionStorage.getItem(CLE_RECHARGE) ?? "0");
    if (Date.now() - avant > 10 * 60_000) {
      window.sessionStorage.setItem(CLE_RECHARGE, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    // stockage indisponible : on signale l'erreur normalement
  }
  return false;
}

/** Signale une erreur (5 par page au plus, sans doublon). Ne lève jamais d'erreur. */
export function signalerErreur(err: unknown, origine: string): void {
  try {
    const texte = texteErreur(err);
    if (!texte || rechargerSiMiseAJour(texte)) return;
    if (dejaEnvoyees.has(texte) || dejaEnvoyees.size >= MAX_PAR_PAGE) return;
    dejaEnvoyees.add(texte);
    const ecran = `${window.location.pathname} (${origine})`;
    void envoyerErreur(texte, ecran, navigateurCourt(navigator.userAgent));
  } catch {
    // le rapport d'erreur ne doit jamais faire planter l'appli
  }
}
