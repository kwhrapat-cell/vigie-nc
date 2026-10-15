// Appelé par la base (pg_net, déclencheur vigie_alarme_moderateurs) quand la
// liste des modérateurs change : prévient les téléphones des modérateurs qui
// ont activé l'alarme dans l'écran /moderation.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { endpointValide, isSecurityEvent, pushConfigured, PushTarget, securityPayload, sendPush } from "@/lib/push-server";

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

  let body: { evenement?: unknown; nom?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // corps illisible : refusé ci-dessous
  }
  const evenement = body.evenement;
  if (!isSecurityEvent(evenement)) {
    return NextResponse.json({ erreur: "evenement inconnu" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("moderation_alertes_destinataires", { p_secret: secret });
  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  const payload = securityPayload(evenement, body.nom);
  const cibles = ((data ?? []) as PushTarget[]).filter((a) => endpointValide(a.endpoint));
  // Gardée 24 h par le service d'envoi si le téléphone est éteint.
  const resultats = await Promise.all(
    cibles.map(async (a) => ({ endpoint: a.endpoint, r: await sendPush(a, payload, 24 * 3600) })),
  );

  const partis = resultats.filter((x) => x.r === "gone").map((x) => x.endpoint);
  if (partis.length > 0) {
    await supabase.rpc("moderation_alertes_echecs", { p_secret: secret, p_endpoints: partis });
  }

  return NextResponse.json({
    envoyes: resultats.filter((x) => x.r === "ok").length,
    supprimes: partis.length,
    erreurs: resultats.filter((x) => x.r === "error").length,
  });
}
