// Appelé par la base (pg_net, moderation_annonce_publier) quand un
// modérateur publie une annonce générale AVEC notification : l'envoie à
// tous les téléphones abonnés aux alertes, quel que soit leur lieu.
// La base ne remet la liste qu'une seule fois par annonce.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  AnnonceAlerte,
  annoncePayload,
  annonceTtl,
  endpointValide,
  pushConfigured,
  PushTarget,
  sendPush,
} from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Beaucoup de téléphones d'un coup : on laisse le temps d'envoyer.
export const maxDuration = 60;

// Envois en parallèle par paquets, pour ne pas saturer le serveur.
const PAQUET = 100;

interface Destinataires {
  annonce: AnnonceAlerte & { actif: boolean };
  abonnements: PushTarget[];
}

export async function POST(req: Request) {
  const secret = process.env.NOTIF_SECRET;
  if (!secret || req.headers.get("x-vigie-secret") !== secret) {
    return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });
  }
  if (!supabase || !pushConfigured) {
    return NextResponse.json({ erreur: "alertes non configurées" }, { status: 503 });
  }

  let annonceId: unknown;
  try {
    annonceId = ((await req.json()) as { annonce_id?: unknown }).annonce_id;
  } catch {
    annonceId = null;
  }
  if (typeof annonceId !== "string") {
    return NextResponse.json({ erreur: "annonce_id manquant" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("annonce_destinataires", { p_secret: secret, p_annonce_id: annonceId });
  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }
  const { annonce, abonnements } = data as Destinataires;
  if (!annonce.actif) return NextResponse.json({ envoyes: 0, raison: "annonce terminée" });

  const payload = annoncePayload(annonce);
  const ttl = annonceTtl(annonce);
  const cibles = (abonnements ?? []).filter((a) => endpointValide(a.endpoint));

  const resultats: { endpoint: string; r: "ok" | "gone" | "error" }[] = [];
  for (let i = 0; i < cibles.length; i += PAQUET) {
    const paquet = cibles.slice(i, i + PAQUET);
    resultats.push(
      ...(await Promise.all(paquet.map(async (a) => ({ endpoint: a.endpoint, r: await sendPush(a, payload, ttl) })))),
    );
  }

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
