import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// En dev sans variables d'env configurées, les pages retombent sur les
// mode démo en mémoire (lib/demo-store.ts) plutôt que de planter.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

/**
 * Côté serveur (routes /api/*) : un client qui agit avec la session
 * anonyme d'un téléphone (jeton reçu dans l'en-tête Authorization), pour
 * que la base applique ses limites à CE téléphone (vigie_cle_session()).
 */
export function supabaseAvecJeton(jeton: string) {
  if (!isSupabaseConfigured) return null;
  return createClient(supabaseUrl as string, supabaseAnonKey as string, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Jamais de mode démo en production : des signalements fictifs montrés au
// public (faux accidents, fausses inondations) seraient dangereux. Si la
// configuration manque sur le site en ligne, app/layout.tsx affiche
// « Service momentanément indisponible » à la place de l'appli.
const isProduction =
  process.env.VERCEL_ENV === "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
export const demoBlocked = !isSupabaseConfigured && isProduction;
