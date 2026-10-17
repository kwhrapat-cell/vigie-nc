// Fonction Supabase (Edge Function) « purge-photos » : efface les photos
// plus anciennes que vigie_photos_jours() jours (7 par défaut, réglable en
// épisode cyclonique, voir schema.sql) et retire leurs liens.
//
// Appelée chaque nuit par pg_cron (tâche 'vigie-purge-photos'), avec le
// même secret que les alertes (en-tête x-vigie-secret = vigie_config
// 'notif_secret'). Elle tourne chez Supabase, avec la clé serveur fournie
// automatiquement par Supabase (jamais dans l'appli ni dans le dépôt) : la
// base interdit d'effacer un fichier directement en SQL.
//
// Déploiement : Supabase > Edge Functions > « purge-photos », avec
// « Verify JWT » désactivé (le secret ci-dessus protège l'appel).

import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "report-photos";
const LOT = 100;

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return Response.json({ erreur: "configuration manquante" }, { status: 500 });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: cfg } = await admin
    .from("vigie_config")
    .select("valeur")
    .eq("cle", "notif_secret")
    .maybeSingle();
  const secret = cfg?.valeur as string | undefined;
  if (!secret || req.headers.get("x-vigie-secret") !== secret) {
    return Response.json({ erreur: "non autorisé" }, { status: 401 });
  }

  const { data: noms, error } = await admin.rpc("photos_a_supprimer", { p_limite: 1000 });
  if (error) {
    return Response.json({ erreur: error.message }, { status: 500 });
  }
  const aEffacer = ((noms ?? []) as unknown[]).filter((n): n is string => typeof n === "string");

  const effaces: string[] = [];
  const erreurs: string[] = [];
  for (let i = 0; i < aEffacer.length; i += LOT) {
    const lot = aEffacer.slice(i, i + LOT);
    const { error: e } = await admin.storage.from(BUCKET).remove(lot);
    if (e) erreurs.push(e.message);
    else effaces.push(...lot);
  }

  let liensRetires = 0;
  if (effaces.length > 0) {
    const { data } = await admin.rpc("photos_supprimees", { p_noms: effaces });
    liensRetires = typeof data === "number" ? data : 0;
  }

  return Response.json({ effaces: effaces.length, liens_retires: liensRetires, erreurs });
});
