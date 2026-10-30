// Notification de test : envoyée uniquement au téléphone qui la demande
// (bouton « Tester » de l'écran Alertes, ou de l'alarme de sécurité dans
// l'écran de modération : kind = "securite"). Avec kind = "exemple" : une
// alerte de danger au format réel, marquée « Essai » (lib/alerte-exemple.ts),
// pour voir comment elle s'affiche sur le téléphone ou une montre connectée.

import { NextResponse } from "next/server";
import { EXEMPLE_DISTANCE_M, EXEMPLE_SIGNALEMENT, marquerEssai, nomLieuExemple } from "@/lib/alerte-exemple";
import { alertPayload, endpointValide, type PushPayload, pushConfigured, sendPush } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!pushConfigured) {
    return NextResponse.json({ erreur: "alertes non configurées" }, { status: 503 });
  }
  let body: { endpoint?: unknown; p256dh?: unknown; auth?: unknown; kind?: unknown; nom?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // corps illisible : refusé ci-dessous
  }
  const { endpoint, p256dh, auth } = body;
  if (!endpointValide(endpoint) || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ erreur: "abonnement invalide" }, { status: 400 });
  }
  const target = { endpoint, p256dh, auth };

  // Texte clair et précis (pas d'emoji) : voir alertPayload() dans lib/push-server.ts
  let payload: PushPayload;
  if (body.kind === "securite") {
    payload = {
      title: "Vigie NC : alarme de sécurité activée",
      body: "Tu seras prévenu ici si la liste des modérateurs change : ajout, code changé, accès retiré.",
      url: "/moderation",
      tag: "test-securite",
    };
  } else if (body.kind === "exemple") {
    // Le nom du lieu d'alerte n'est pas enregistré : il sert seulement à écrire ce message.
    payload = marquerEssai(
      alertPayload(EXEMPLE_SIGNALEMENT, { ...target, nom: nomLieuExemple(body.nom), distance_m: EXEMPLE_DISTANCE_M }),
    );
  } else {
    payload = {
      title: "Vigie NC : notifications activées",
      body: "Tu recevras ici les dangers confirmés près de ton lieu d'alerte : accident, route coupée, inondation, danger, météo.",
      url: "/alertes",
      tag: "test",
    };
  }
  const r = await sendPush(target, payload);
  return NextResponse.json({ resultat: r }, { status: r === "ok" ? 200 : 502 });
}
