// Point route du mode conduite : le téléphone envoie les signalements qu'il
// a choisis devant lui (identifiant + distance, calculée chez lui : sa
// position ne part pas), avec sa session anonyme. La base vérifie la
// session et les limites, et renvoie le contenu public de ces signalements ;
// l'IA en fait une à trois phrases à lire à voix haute (lib/ia.ts).
// En cas d'échec, le téléphone dit le point route sans l'IA
// (textePointRoute de lib/conduite.ts). Rien n'est écrit dans les journaux.

import { NextResponse } from "next/server";
import { EvenementPointRoute, iaConfiguree, pointRouteIa } from "@/lib/ia";
import { getReliability } from "@/lib/reliability";
import { supabaseAvecJeton } from "@/lib/supabase";
import { RelaySource, ReportType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 10;
const DISTANCE_MAX_M = 20_000;

// Réponse de ia_point_route_preparer (supabase/schema.sql)
interface Ligne {
  id: string;
  type: ReportType;
  lieu: string | null;
  minutes: number;
  confirmations: number;
  infirmations: number;
  source_officielle: string | null;
  relais_source: RelaySource | null;
  description: string | null;
  resume_ia: string | null;
  fin_annoncee: string | null;
}

const ERREURS_BASE: Record<string, number> = {
  connexion_requise: 401,
  point_route_trop_tot: 429,
  point_route_jour: 429,
  ia_quota: 429,
  ia_coupee: 503,
  point_route_invalide: 400,
};

export async function POST(req: Request) {
  if (!iaConfiguree) {
    return NextResponse.json({ erreur: "ia_non_configuree" }, { status: 503 });
  }
  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jeton || jeton.length > 4000) {
    return NextResponse.json({ erreur: "connexion_requise" }, { status: 401 });
  }
  const client = supabaseAvecJeton(jeton);
  if (!client) {
    return NextResponse.json({ erreur: "base_non_configuree" }, { status: 503 });
  }

  let corps: { evenements?: unknown; avecCap?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return NextResponse.json({ erreur: "demande_invalide" }, { status: 400 });
  }
  const avecCap = corps.avecCap === true;
  const liste = Array.isArray(corps.evenements) ? corps.evenements : [];
  const distances = new Map<string, number>();
  for (const e of liste.slice(0, MAX)) {
    const o = (e ?? {}) as { id?: unknown; distanceM?: unknown };
    if (typeof o.id !== "string" || !UUID.test(o.id)) continue;
    if (typeof o.distanceM !== "number" || !Number.isFinite(o.distanceM)) continue;
    distances.set(o.id, Math.min(Math.max(o.distanceM, 0), DISTANCE_MAX_M));
  }
  if (distances.size === 0) {
    return NextResponse.json({ erreur: "point_route_invalide" }, { status: 400 });
  }

  const { data, error } = await client.rpc("ia_point_route_preparer", { p_ids: [...distances.keys()] });
  if (error) {
    const code = Object.keys(ERREURS_BASE).find((k) => error.message.includes(k));
    return NextResponse.json({ erreur: code ?? "base_indisponible" }, { status: code ? ERREURS_BASE[code] : 500 });
  }

  // Dans l'ordre du téléphone (du plus proche au plus loin), seulement ce
  // qui est encore en cours.
  const lignes = new Map(((data ?? []) as Ligne[]).map((l) => [l.id, l]));
  const evenements: EvenementPointRoute[] = [];
  for (const [id, distanceM] of distances) {
    const l = lignes.get(id);
    if (!l) continue;
    const fiab = getReliability({
      confirmations: l.confirmations,
      infirmations: l.infirmations,
      officialSource: l.source_officielle,
      relaySource: l.relais_source,
    });
    evenements.push({
      type: l.type,
      lieu: l.lieu,
      distanceM,
      minutes: l.minutes,
      confirme: l.confirmations >= 1 || Boolean(l.source_officielle),
      fiabilite: fiab.contested ? `${fiab.detail}, ${fiab.contested.toLowerCase()}` : fiab.detail,
      relaye: Boolean(l.relais_source),
      details: l.resume_ia ?? l.description,
      finAnnoncee: l.fin_annoncee,
    });
  }
  if (evenements.length === 0) {
    return NextResponse.json({ erreur: "rien_devant" }, { status: 404 });
  }

  const r = await pointRouteIa(evenements, avecCap);
  if (!r.ok) {
    return NextResponse.json({ erreur: r.erreur }, { status: 502 });
  }
  return NextResponse.json({ texte: r.texte });
}
