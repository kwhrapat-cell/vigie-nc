// Notification de test : envoyée uniquement au téléphone qui la demande
// (bouton « Tester » de l'écran Alertes, ou de l'alarme de sécurité dans
// l'écran de modération : kind = "securite").

import { NextResponse } from "next/server";
import { endpointValide, pushConfigured, sendPush } from "@/lib/push-server";
import { NOM_APPLI } from "@/lib/territoire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!pushConfigured) {
    return NextResponse.json({ erreur: "alertes non configurées" }, { status: 503 });
  }
  let body: { endpoint?: unknown; p256dh?: unknown; auth?: unknown; kind?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // corps illisible : refusé ci-dessous
  }
  const { endpoint, p256dh, auth } = body;
  if (!endpointValide(endpoint) || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ erreur: "abonnement invalide" }, { status: 400 });
  }

  // Texte clair et précis (pas d'emoji) : voir alertPayload() dans lib/push-server.ts
  const payload =
    body.kind === "securite"
      ? {
          title: `${NOM_APPLI} : alarme de sécurité activée`,
          body: "Tu seras prévenu ici si la liste des modérateurs change : ajout, code changé, accès retiré.",
          url: "/moderation",
          tag: "test-securite",
        }
      : {
          title: `${NOM_APPLI} : notifications activées`,
          body: "Tu recevras ici les dangers confirmés près de ton lieu d'alerte : accident, route coupée, inondation, danger, météo.",
          url: "/alertes",
          tag: "test",
        };
  const r = await sendPush({ endpoint, p256dh, auth }, payload);
  return NextResponse.json({ resultat: r }, { status: r === "ok" ? 200 : 502 });
}
