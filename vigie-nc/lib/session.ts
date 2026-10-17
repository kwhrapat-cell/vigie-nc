"use client";

// Session anonyme Supabase : chaque téléphone reçoit une identité signée
// par Supabase (pas de compte, pas d'e-mail, rien qui dise qui tu es). Les
// fonctions SQL s'en servent pour l'anti-abus, le vote unique et la
// reconnaissance de tes propres signalements — à la place de l'ancien
// identifiant créé par le téléphone, qu'un script pouvait changer à
// volonté. Elle est gardée par le navigateur et renouvelée toute seule.
// À activer une fois dans Supabase : Authentication > Sign In / Providers >
// « Allow anonymous sign-ins ».

import { supabase } from "./supabase";
import { getTurnstileToken, turnstileConfigured } from "./turnstile";

let pending: Promise<boolean> | null = null;

if (supabase) {
  // Session supprimée (purge des sessions inactives, données du navigateur
  // effacées…) : la prochaine écriture en ouvrira une nouvelle.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") pending = null;
  });
}

/** Ouvre (ou réutilise) la session anonyme de ce téléphone. */
export function ensureSession(): Promise<boolean> {
  if (!supabase) return Promise.resolve(false);
  if (!pending) {
    const client = supabase;
    pending = (async () => {
      const { data } = await client.auth.getSession();
      if (data.session) return true;
      const captchaToken = turnstileConfigured ? await getTurnstileToken() : undefined;
      const { error } = await client.auth.signInAnonymously(
        captchaToken ? { options: { captchaToken } } : undefined,
      );
      if (error) throw error;
      return true;
    })();
    pending.catch(() => {
      pending = null; // on réessaiera à la prochaine action
    });
  }
  return pending;
}
