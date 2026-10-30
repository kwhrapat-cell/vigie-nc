// Envoi des notifications (côté serveur uniquement : routes /api/*).
// Clés VAPID dans les variables d'environnement Vercel :
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (et NOTIF_SECRET).

import webpush from "web-push";
import { LEGAL } from "./legal";
import { ProblemeAvantDepart, texteAvantDepart, texteFinAlerte, texteSurTrajet } from "./trajet";
import { ANNONCE_NIVEAU_LABELS, AnnonceNiveau, REPORT_TYPE_LABELS, ReportType } from "./types";

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
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
  ttlSeconds = 3 * 3600,
): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: ttlSeconds, urgency: "high" },
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
  relais_source?: string | null;
}

export interface AlertTarget extends PushTarget {
  nom: string | null;
  distance_m: number | null;
  /** Danger sur le trajet favori, pendant l'heure du trajet (notif_destinataires). */
  sur_trajet?: boolean;
  depuis_depart_m?: number | null;
}

/**
 * Texte de la notification d'un danger confirmé. Factuel, sans emoji ni
 * « touche ici » : Chrome (Android) classe en « spam possible » les textes
 * vagues, les emoji d'alarme et les formules d'appel.
 * Ex. « Inondation · RT1, Païta » / « Signalé par 2 personnes, à 3,2 km
 * de « Maison ». »
 * Pas de « confirmé » ici : dans l'appli, « Confirmé » veut dire 4
 * personnes et plus (lib/reliability.ts) ; l'alerte part dès 2.
 */
export function alertPayload(report: AlertReport, target: AlertTarget): PushPayload {
  const label = REPORT_TYPE_LABELS[report.type] ?? "Danger";
  const title = report.lieu ? `${label} · ${report.lieu}` : label;
  const surPlace = report.confirmations;
  const qui = report.source_officielle
    ? `Vérifié par ${report.source_officielle}`
    : report.relais_source
      ? `Info relayée, vue sur place par ${surPlace} personne${surPlace > 1 ? "s" : ""}`
      : `Signalé par ${surPlace + 1} personnes`;
  // Sur le trajet favori : la place sur le trajet compte plus que la distance au lieu d'alerte.
  const d = target.sur_trajet ? null : distanceText(target.distance_m);
  const ou = target.sur_trajet
    ? `, ${texteSurTrajet(target.depuis_depart_m)}`
    : d
      ? `, ${d} ${target.nom ? `de « ${target.nom} »` : "de ton lieu d'alerte"}`
      : "";
  return {
    title,
    body: `${qui}${ou}.`,
    url: `/?signalement=${report.id}`,
    tag: report.id,
  };
}

// ---------------------------------------------------------------------
// Alarme de sécurité (liste des modérateurs modifiée) : envoyée par
// /api/alerte-securite aux téléphones inscrits depuis l'écran /moderation.
// Texte factuel, sans emoji (voir alertPayload).
// ---------------------------------------------------------------------

export type SecurityEvent = "ajout" | "code" | "retrait" | "retabli" | "renomme" | "suppression" | "vidage";

const SECURITY_TEXT: Record<SecurityEvent, (nom: string) => string> = {
  ajout: (n) => `Nouveau modérateur ajouté : ${n}.`,
  code: (n) => `Le code de modération de ${n} a été changé.`,
  retrait: (n) => `Accès de modération retiré : ${n}.`,
  retabli: (n) => `Accès de modération rétabli : ${n}.`,
  renomme: (n) => `Modérateur renommé : ${n}.`,
  suppression: (n) => `Modérateur supprimé : ${n}.`,
  vidage: () => "La liste des modérateurs a été entièrement effacée.",
};

export function isSecurityEvent(e: unknown): e is SecurityEvent {
  return typeof e === "string" && e in SECURITY_TEXT;
}

/** Ex. « Vigie NC · Modération modifiée » / « Nouveau modérateur ajouté : Paul. Si ce n'est pas toi… » */
export function securityPayload(evenement: SecurityEvent, nom: unknown): PushPayload {
  const n =
    typeof nom === "string" && nom.trim()
      ? nom.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 85)
      : "nom inconnu";
  return {
    title: "Vigie NC · Modération modifiée",
    body: `${SECURITY_TEXT[evenement](n)} Si ce n'est pas toi, vérifie ton compte Supabase.`,
    url: "/moderation",
    // un tag différent à chaque fois : plusieurs changements = plusieurs notifications
    tag: `securite-${Date.now()}`,
  };
}

// ---------------------------------------------------------------------
// Annonce générale (toute la Calédonie) : envoyée par /api/annonce à tous
// les téléphones abonnés aux alertes, quel que soit leur lieu, quand le
// modérateur l'a demandé (vigilance ou urgence seulement).
// Texte factuel, sans emoji (voir alertPayload).
// ---------------------------------------------------------------------

export interface AnnonceAlerte {
  id: string;
  niveau: AnnonceNiveau;
  texte: string;
  source: string | null;
  expires_at: string;
}

/** Ex. « Urgence · Sécurité civile » / « Cyclone : restez chez vous jusqu'à la levée de l'alerte. » */
export function annoncePayload(a: AnnonceAlerte): PushPayload {
  const nettoye = (t: string) => t.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();
  const source = a.source ? nettoye(a.source).slice(0, 60) : "Vigie NC";
  const texte = nettoye(a.texte).replace(/\s*\n\s*/g, " ");
  return {
    title: `${ANNONCE_NIVEAU_LABELS[a.niveau] ?? "Annonce"} · ${source}`,
    body: texte.length > 240 ? `${texte.slice(0, 239)}…` : texte,
    url: `/?annonce=${a.id}`,
    tag: `annonce-${a.id}`,
  };
}

/** Durée de garde par le service d'envoi si le téléphone est éteint : jusqu'à la fin de l'annonce (1 h à 24 h). */
export function annonceTtl(a: AnnonceAlerte, now = Date.now()): number {
  const restant = Math.floor((new Date(a.expires_at).getTime() - now) / 1000);
  return Math.min(24 * 3600, Math.max(3600, Number.isFinite(restant) ? restant : 3600));
}

// ---------------------------------------------------------------------
// Trajet favori : point « avant départ » (/api/trajet) et fin d'alerte
// (/api/notifier avec fin = true). Textes dans lib/trajet.ts (testés).
// ---------------------------------------------------------------------

export interface AvantDepart extends PushTarget {
  sens: "aller" | "retour";
  depart: string;
  jour: string;
  /** 0 = « tout est calme » (option du trajet) */
  nb: number;
  /** Signalements à surveiller sur le trajet (travaux, trafic, pas encore confirmés). */
  surveiller?: number | null;
  problemes: ProblemeAvantDepart[];
}

export function avantDepartPayload(t: AvantDepart): PushPayload {
  const { title, body } = texteAvantDepart(t);
  return { title, body, url: "/?trajet=1", tag: `trajet-${t.sens}-${t.jour}` };
}

/** Gardée par le service d'envoi jusqu'au départ seulement (5 à 30 min) : après, elle ne sert plus. */
export function avantDepartTtl(t: AvantDepart, now = Date.now()): number {
  const restant = Math.floor((new Date(t.depart).getTime() - now) / 1000);
  return Math.min(30 * 60, Math.max(5 * 60, Number.isFinite(restant) ? restant : 30 * 60));
}

/** Destinataire d'une fin d'alerte (notif_fin_destinataires). */
export interface FinTarget extends PushTarget {
  nom?: string | null;
  sur_trajet?: boolean;
}

/**
 * Même étiquette que l'alerte du danger : la fin la remplace dans la liste
 * des notifications. Reçue par le trajet → ouvre le point sur le trajet ;
 * par la zone d'alerte → ouvre la fiche (marquée terminée).
 */
export function finPayload(
  report: { id: string; type: ReportType; lieu: string | null },
  target: FinTarget = {} as FinTarget,
): PushPayload {
  const surTrajet = target.sur_trajet !== false;
  const { title, body } = texteFinAlerte(report.type, report.lieu, { surTrajet, nom: target.nom ?? null });
  return { title, body, url: surTrajet ? "/?trajet=1" : `/?signalement=${report.id}`, tag: report.id };
}
