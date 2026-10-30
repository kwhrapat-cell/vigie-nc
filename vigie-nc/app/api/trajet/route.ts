// Appelé par la base (pg_cron toutes les 5 min → vigie_trajets_appeler,
// seulement quand un départ approche) : envoie le point « avant départ »
// aux téléphones dont le trajet favori a un danger confirmé, 30 min avant
// l'heure de départ choisie. Rien n'est envoyé si le trajet est calme.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  AvantDepart,
  avantDepartPayload,
  avantDepartTtl,
  endpointValide,
  pushConfigured,
  sendPush,
} from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.NOTIF_SECRET;
  if (!secret || req.headers.get("x-vigie-secret") !== secret) {
    return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });
  }
  if (!supabase || !pushConfigured) {
    return NextResponse.json({ erreur: "alertes non configurées" }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("trajet_avant_depart", { p_secret: secret });
  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }
  const trajets = ((data as { trajets?: AvantDepart[] } | null)?.trajets ?? []).filter((t) =>
    endpointValide(t.endpoint),
  );

  const resultats = await Promise.all(
    trajets.map(async (t) => ({
      endpoint: t.endpoint,
      r: await sendPush(t, avantDepartPayload(t), avantDepartTtl(t)),
    })),
  );

  const partis = resultats.filter((x) => x.r === "gone").map((x) => x.endpoint);
  if (partis.length > 0) {
    await supabase.rpc("notif_echecs", { p_secret: secret, p_endpoints: partis });
  }

  return NextResponse.json({
    envoyes: resultats.filter((x) => x.r === "ok").length,
    supprimes: partis.length,
    erreurs: resultats.filter((x) => x.r === "error").length,
  });
}
