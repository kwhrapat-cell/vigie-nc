// Appelé par la base (pg_net) :
//   - déclencheur vigie_signal_notification, quand un danger est confirmé :
//     récupère les destinataires (zone d'alerte ou trajet favori) et envoie
//     les alertes ;
//   - déclencheur vigie_signal_fin_alerte ({ fin: true }), quand un danger
//     annoncé dans les 12 h (zone d'alerte ou trajet) est déclaré terminé :
//     « fin d'alerte ».

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  AlertReport,
  AlertTarget,
  alertPayload,
  endpointValide,
  FinTarget,
  finPayload,
  PushPayload,
  PushTarget,
  pushConfigured,
  sendPush,
} from "@/lib/push-server";
import type { ReportType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Destinataires {
  report: AlertReport & { actif: boolean };
  abonnements: AlertTarget[];
}

interface DestinatairesFin {
  report: { id: string; type?: ReportType; lieu?: string | null };
  abonnements: FinTarget[];
}

export async function POST(req: Request) {
  const secret = process.env.NOTIF_SECRET;
  if (!secret || req.headers.get("x-vigie-secret") !== secret) {
    return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });
  }
  if (!supabase || !pushConfigured) {
    return NextResponse.json({ erreur: "alertes non configurées" }, { status: 503 });
  }

  let corps: { report_id?: unknown; fin?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    corps = {};
  }
  const reportId = corps.report_id;
  if (typeof reportId !== "string") {
    return NextResponse.json({ erreur: "report_id manquant" }, { status: 400 });
  }

  let envois: { cible: PushTarget; payload: PushPayload }[];
  if (corps.fin === true) {
    const { data, error } = await supabase.rpc("notif_fin_destinataires", { p_secret: secret, p_report_id: reportId });
    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
    const { report, abonnements } = data as DestinatairesFin;
    if (!report.type) return NextResponse.json({ envoyes: 0, raison: "signalement en cours" });
    const fini = { id: report.id, type: report.type, lieu: report.lieu ?? null };
    envois = (abonnements ?? []).map((cible) => ({ cible, payload: finPayload(fini, cible) }));
  } else {
    const { data, error } = await supabase.rpc("notif_destinataires", { p_secret: secret, p_report_id: reportId });
    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
    const { report, abonnements } = data as Destinataires;
    if (!report.actif) return NextResponse.json({ envoyes: 0, raison: "signalement terminé" });
    envois = (abonnements ?? []).map((a) => ({ cible: a, payload: alertPayload(report, a) }));
  }

  const cibles = envois.filter((e) => endpointValide(e.cible.endpoint));
  const resultats = await Promise.all(
    cibles.map(async (e) => ({ endpoint: e.cible.endpoint, r: await sendPush(e.cible, e.payload) })),
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
