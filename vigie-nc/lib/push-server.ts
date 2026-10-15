// Envoi des notifications (côté serveur uniquement : routes /api/*).
// Clés VAPID dans les variables d'environnement Vercel :
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (et NOTIF_SECRET).

import webpush from "web-push";
import { LEGAL } from "./legal";
import { REPORT_TYPE_LABELS, ReportType } from "./types";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (pushConfigured) {
  webpush.setVapidDetails(`mailto:${LEGAL.contact}`, PUBLIC_KEY as string, PRIVATE_KEY as string);
}

// Mêmes services que vigie_endpoint_valide() dans supabase/schema.sql :
// on n'envoie jamais rien vers une autre adresse.
const ENDPOINT_OK =
  /^https:\/\/(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//;

export function endpointValide(e: unknown): e is string {
  return typeof e === "string" && e.length <= 1000 && ENDPOINT_OK.test(e);
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** « gone » : l'abonnement n'existe plus (à supprimer de la base). */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 3 * 3600, urgency: "high" },
    );
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "error";
  }
}

function distanceText(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  if (m < 1000) return `à ${Math.max(100, Math.round(m / 100) * 100)} m`;
  const km = m / 1000;
  return `à ${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

export interface AlertReport {
  id: string;
  type: ReportType;
  lieu: string | null;
  confirmations: number;
  source_officielle: string | null;
}

export interface AlertTarget extends PushTarget {
  nom: string | null;
  distance_m: number | null;
}

/**
 * Texte de la notification d'un danger confirmé. Factuel, sans emoji ni
 * « touche ici » : Chrome (Android) classe en « spam possible » les textes
 * vagues, les emoji d'alarme et les formules d'appel.
 * Ex. « Inondation · RT1, Païta » / « Signalement confirmé par 2 personnes,
 * à 3,2 km de « Maison ». »
 */
export function alertPayload(report: AlertReport, target: AlertTarget): PushPayload {
  const label = REPORT_TYPE_LABELS[report.type] ?? "Danger";
  const title = report.lieu ? `${label} · ${report.lieu}` : label;
  const qui = report.source_officielle
    ? `Signalement vérifié par ${report.source_officielle}`
    : `Signalement confirmé par ${report.confirmations + 1} personnes`;
  const d = distanceText(target.distance_m);
  const ou = d ? `, ${d} ${target.nom ? `de « ${target.nom} »` : "de ton lieu d'alerte"}` : "";
  return {
    title,
    body: `${qui}${ou}.`,
    url: `/?signalement=${report.id}`,
    tag: report.id,
  };
}
