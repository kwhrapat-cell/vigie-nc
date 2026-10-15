// Appelé par la base (pg_net, déclencheur vigie_signal_notification) quand
// un danger est confirmé : récupère les destinataires et envoie les alertes.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { AlertReport, AlertTarget, alertPayload, endpointValide, pushConfigured, sendPush } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Destinataires {
  report: AlertReport & { actif: boolean };
  abonnements: AlertTarget[];
}

export async function POST(req: Request) {
  const secret = process.env.NOTIF_SECRET;
  if (!secret || req.headers.get("x-vigie-secret") !== secret) {
    return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });
  }
  if (!supabase || !pushConfigured) {
    return NextResponse.json({ erreur: "alertes non configurées" }, { status: 503 });
  }

  let reportId: unknown;
  try {
    reportId = ((await req.json()) as { report_id?: unknown }).report_id;
  } catch {
    reportId = null;
  }
  if (typeof reportId !== "string") {
    return NextResponse.json({ erreur: "report_id manquant" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("notif_destinataires", { p_secret: secret, p_report_id: reportId });
  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }
  const { report, abonnements } = data as Destinataires;
  if (!report.actif) return NextResponse.json({ envoyes: 0, raison: "signalement terminé" });

  const cibles = (abonnements ?? []).filter((a) => endpointValide(a.endpoint));
  const resultats = await Promise.all(
    cibles.map(async (a) => ({ endpoint: a.endpoint, r: await sendPush(a, alertPayload(report, a)) })),
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
