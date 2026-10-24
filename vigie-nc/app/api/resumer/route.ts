// Appelé par la base (pg_net, vigie_demander_resume) quand 2 personnes au
// moins ont décrit le même événement : lit les témoignages, les fait
// résumer par l'IA (lib/ia.ts), puis enregistre le résumé. Si d'autres
// témoignages arrivent pendant ce temps, refait un passage (3 au plus).
// Les textes ne sont jamais écrits dans les journaux du serveur.

import { NextResponse } from "next/server";
import { iaConfiguree, resumerTemoignages, Temoignage } from "@/lib/ia";
import { supabase } from "@/lib/supabase";
import { ReportType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PASSAGES_MAX = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Réponse de ia_temoignages (supabase/schema.sql)
interface Lecture {
  report: {
    id: string;
    type: ReportType;
    lieu: string | null;
    minutes: number;
    source_officielle: string | null;
    actif: boolean;
    masque: boolean;
  };
  nb: number;
  // Heure du dernier témoignage : renvoyée TELLE QUELLE (texte) à
  // ia_enregistrer_resume, sans passer par Date (qui perdrait les
  // microsecondes et ferait croire à un témoignage plus récent).
  version: string | null;
  temoignages: Temoignage[];
}

interface Ecriture {
  enregistre: boolean;
  nouveaux: boolean;
}

export async function POST(req: Request) {
  const secret = process.env.NOTIF_SECRET;
  if (!secret || req.headers.get("x-vigie-secret") !== secret) {
    return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });
  }
  if (!supabase) {
    return NextResponse.json({ erreur: "base non configurée" }, { status: 503 });
  }
  if (!iaConfiguree) {
    return NextResponse.json({ erreur: "IA non configurée (ANTHROPIC_API_KEY)" }, { status: 503 });
  }

  let reportId: unknown;
  try {
    reportId = ((await req.json()) as { report_id?: unknown }).report_id;
  } catch {
    reportId = null;
  }
  if (typeof reportId !== "string" || !UUID.test(reportId)) {
    return NextResponse.json({ erreur: "report_id manquant" }, { status: 400 });
  }

  let passages = 0;
  let enregistre = false;
  while (passages < PASSAGES_MAX) {
    passages += 1;

    const { data, error } = await supabase.rpc("ia_temoignages", { p_secret: secret, p_report_id: reportId });
    if (error) {
      return NextResponse.json({ erreur: error.message }, { status: 500 });
    }
    const lu = data as Lecture;
    if (!lu.report.actif || lu.report.masque || lu.nb < 2 || !lu.version) {
      return NextResponse.json({ enregistre, passages, raison: "rien à résumer" });
    }

    const r = await resumerTemoignages({
      type: lu.report.type,
      lieu: lu.report.lieu,
      minutes: lu.report.minutes,
      temoignages: lu.temoignages,
      sourceOfficielle: lu.report.source_officielle,
    });
    if (!r.ok) {
      // La demande reste marquée « en cours » une minute au plus : le
      // témoignage suivant en refera une.
      return NextResponse.json({ erreur: r.erreur, passages }, { status: 502 });
    }

    const { data: ecrit, error: errEcriture } = await supabase.rpc("ia_enregistrer_resume", {
      p_secret: secret,
      p_report_id: reportId,
      p_resume: r.resume,
      p_nb: lu.nb,
      p_version: lu.version,
    });
    if (errEcriture) {
      return NextResponse.json({ erreur: errEcriture.message }, { status: 500 });
    }
    const res = ecrit as Ecriture;
    enregistre = enregistre || res.enregistre;
    if (!res.nouveaux) break;
  }

  return NextResponse.json({ enregistre, passages });
}
