// État de santé de Vigie NC, pour un moniteur gratuit (UptimeRobot, Better
// Stack…) qui l'appelle toutes les 5 minutes et prévient Patrice par
// e-mail ou SMS si ça ne répond plus.
//   200 {"ok": true, ...}  : le site ET la base répondent
//   503 {"ok": false, ...} : la base ne répond pas (panne, projet en pause…)
// Ces appels réguliers comptent aussi comme activité pour Supabase, ce qui
// évite la mise en pause automatique d'un projet gratuit trop calme.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ ok: false, base: "non configurée" }, { status: 503, headers: NO_STORE });
  }
  const started = Date.now();
  const { data, error } = await supabase.rpc("vigie_sante");
  const ms = Date.now() - started;
  if (error) {
    return NextResponse.json({ ok: false, base: "erreur", ms }, { status: 503, headers: NO_STORE });
  }
  const sante = (data ?? {}) as { actifs?: number };
  return NextResponse.json({ ok: true, base: "ok", ms, actifs: sante.actifs ?? null }, { headers: NO_STORE });
}
