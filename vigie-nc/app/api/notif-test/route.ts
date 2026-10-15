// Notification de test : envoyée uniquement au téléphone qui la demande
// (bouton « Tester » de l'écran Alertes).

import { NextResponse } from "next/server";
import { endpointValide, pushConfigured, sendPush } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!pushConfigured) {
    return NextResponse.json({ erreur: "alertes non configurées" }, { status: 503 });
  }
  let body: { endpoint?: unknown; p256dh?: unknown; auth?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // corps illisible : refusé ci-dessous
  }
  const { endpoint, p256dh, auth } = body;
  if (!endpointValide(endpoint) || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ erreur: "abonnement invalide" }, { status: 400 });
  }

  const r = await sendPush(
    { endpoint, p256dh, auth },
    {
      title: "🔔 Vigie NC",
      body: "Les alertes fonctionnent sur ce téléphone.",
      url: "/alertes",
      tag: "test",
    },
  );
  return NextResponse.json({ resultat: r }, { status: r === "ok" ? 200 : 502 });
}
