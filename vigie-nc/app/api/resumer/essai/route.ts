// Essai de l'IA depuis /moderation (onglet « IA ») : un modérateur écrit
// quelques témoignages inventés et voit le résumé que l'IA en ferait.
// Rien n'est enregistré ni publié. Code de modérateur obligatoire, vérifié
// par la base (moderation_ia_essai), et l'essai compte dans la limite
// d'appels par heure.

import { NextResponse } from "next/server";
import { iaConfiguree, resumerTemoignages, TEMOIGNAGE_MAX } from "@/lib/ia";
import { supabase } from "@/lib/supabase";
import { IA_ESSAI_TEMOIGNAGES_MAX, IA_ESSAI_TEMOIGNAGES_MIN, ReportType, SIGNALABLE_TYPES } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ERREURS_BASE: Record<string, { status: number; erreur: string }> = {
  code_invalide: { status: 403, erreur: "code_invalide" },
  ia_quota: { status: 429, erreur: "ia_quota" },
  ia_coupee: { status: 503, erreur: "ia_coupee" },
};

export async function POST(req: Request) {
  if (!supabase) {
    return NextResponse.json({ erreur: "base_non_configuree" }, { status: 503 });
  }
  if (!iaConfiguree) {
    return NextResponse.json({ erreur: "ia_non_configuree" }, { status: 503 });
  }

  let corps: { code?: unknown; type?: unknown; lieu?: unknown; temoignages?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return NextResponse.json({ erreur: "demande_invalide" }, { status: 400 });
  }

  const code = typeof corps.code === "string" ? corps.code : "";
  const type = corps.type as ReportType;
  const lieu = typeof corps.lieu === "string" ? corps.lieu.trim().slice(0, 80) : "";
  const textes = Array.isArray(corps.temoignages)
    ? corps.temoignages
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => t.length > 0)
    : [];

  if (code.length < 16 || code.length > 200) {
    return NextResponse.json({ erreur: "code_invalide" }, { status: 403 });
  }
  if (!(SIGNALABLE_TYPES as string[]).includes(type)) {
    return NextResponse.json({ erreur: "type_invalide" }, { status: 400 });
  }
  if (
    textes.length < IA_ESSAI_TEMOIGNAGES_MIN ||
    textes.length > IA_ESSAI_TEMOIGNAGES_MAX ||
    textes.some((t) => t.length > TEMOIGNAGE_MAX)
  ) {
    return NextResponse.json({ erreur: "temoignages_invalides" }, { status: 400 });
  }

  const { error } = await supabase.rpc("moderation_ia_essai", { p_code: code });
  if (error) {
    const connue = Object.keys(ERREURS_BASE).find((k) => error.message.includes(k));
    const e = connue ? ERREURS_BASE[connue] : { status: 500, erreur: "base_indisponible" };
    return NextResponse.json({ erreur: e.erreur }, { status: e.status });
  }

  // Du plus ancien au plus récent, 10 minutes d'écart entre deux témoignages.
  const n = textes.length;
  const r = await resumerTemoignages({
    type,
    lieu: lieu || null,
    minutes: (n - 1) * 10,
    temoignages: textes.map((texte, i) => ({ texte, minutes: (n - 1 - i) * 10 })),
  });
  if (!r.ok) {
    return NextResponse.json({ erreur: r.erreur }, { status: 502 });
  }
  return NextResponse.json({ resume: r.resume });
}
